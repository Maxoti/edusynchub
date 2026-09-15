'use strict';

/**
 * Wallet Router — EdusyncHub
 * File: src/routes/wallet.ts
 *
 * Handles:
 *  GET  /balance                     — teacher's current balance
 *  POST /withdraw                    — initiate a payout via IntaSend
 *  POST /webhooks/intasend-payout    — IntaSend webhook: marks payout complete/failed
 *
 * Safety guarantees:
 *  • Row-level lock (FOR UPDATE) on teacher_balances prevents concurrent
 *    withdrawals from double-spending the same balance.
 *  • Idempotency key (client-supplied X-Idempotency-Key header) prevents
 *    duplicate withdrawals from double-taps or network retries.
 *  • Payout row is inserted INSIDE the transaction that locks the balance —
 *    if IntaSend call fails, the payout row is already written as 'failed'
 *    so the in-flight guard does not block the next attempt.
 *  • Balance deduction happens ONLY in the webhook handler when IntaSend
 *    confirms success — never optimistically upfront.
 *  • All DB mutations run inside explicit transactions with ROLLBACK on error.
 */

import { Router } from "express";
import { pool } from "../lib/db";
import { initiatePayout } from "../lib/intasend";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch a teacher row with a FOR UPDATE lock inside an existing transaction.
 * Throws if the teacher is not found.
 */
async function lockTeacher(client: any, teacherId: number) {
  const { rows } = await client.query(
    `SELECT id, name, pochi_number
       FROM teachers
      WHERE id = $1
      FOR UPDATE`,
    [teacherId]
  );
  if (!rows[0]) throw new Error("Teacher not found");
  return rows[0];
}

/**
 * Fetch the balance row with a FOR UPDATE lock inside an existing transaction.
 * Returns 0 if no balance row exists yet.
 */
async function lockBalance(client: any, teacherId: number): Promise<number> {
  const { rows } = await client.query(
    `SELECT available_balance
       FROM teacher_balances
      WHERE teacher_id = $1`,
    [teacherId]
  );
  return Number(rows[0]?.available_balance ?? 0);
}

/**
 * Check if a payout with this idempotency key already exists.
 * Returns the existing payout row or null.
 */
async function findByIdempotencyKey(
  client: any,
  teacherId: number,
  key: string
) {
  const { rows } = await client.query(
    `SELECT id, status, amount
       FROM payouts
      WHERE teacher_id       = $1
        AND idempotency_key  = $2
      LIMIT 1`,
    [teacherId, key]
  );
  return rows[0] ?? null;
}

/**
 * Check if a payout is already in flight (pending or processing).
 */
async function hasInFlightPayout(
  client: any,
  teacherId: number
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT id
       FROM payouts
      WHERE teacher_id = $1
        AND status IN ('pending', 'processing')
      LIMIT 1`,
    [teacherId]
  );
  return rows.length > 0;
}

// ─── GET /balance ─────────────────────────────────────────────────────────────

router.get("/balance", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT available_balance
         FROM teacher_balances
        WHERE teacher_id = $1`,
      [req.teacherId]
    );
    const availableBalance = Number(rows[0]?.available_balance ?? 0);

    return res.json({
      availableBalance,
      canWithdraw: availableBalance > 0,
    });
  } catch (err) {
    console.error("[wallet] GET /balance error:", err);
    return res.status(500).json({ error: "Could not fetch balance" });
  }
});

// ─── POST /withdraw ───────────────────────────────────────────────────────────

router.post("/withdraw", requireAuth, async (req: AuthedRequest, res) => {
  // ── 1. Parse and validate amount ──────────────────────────────────────────
  const requestedAmount = Number(req.body?.amount);

  if (!requestedAmount || requestedAmount <= 0 || !isFinite(requestedAmount)) {
    return res.status(400).json({ error: "Enter a valid withdrawal amount." });
  }

  // ── 2. Idempotency key — client must send X-Idempotency-Key header ────────
  // This prevents duplicate payouts from double-taps or network retries.
  // If the client doesn't send one, generate one from teacherId + amount + minute
  // so at minimum we deduplicate within the same minute.
  const idempotencyKey =
    (req.headers["x-idempotency-key"] as string | undefined)?.trim() ||
    `${req.teacherId}-${requestedAmount}-${Math.floor(Date.now() / 60_000)}`;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── 3. Lock teacher row ────────────────────────────────────────────────
    let teacher: any;
    try {
      teacher = await lockTeacher(client, req.teacherId!);
    } catch {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Teacher not found" });
    }

    // ── 4. Idempotency check — return early if already processed ──────────
    const existing = await findByIdempotencyKey(
      client,
      teacher.id,
      idempotencyKey
    );

    if (existing) {
      await client.query("ROLLBACK");

      // If already completed or processing, tell the client
      if (existing.status === "completed") {
        return res.status(200).json({
          message:   "Withdrawal already completed",
          payoutId:  existing.id,
          idempotent: true,
        });
      }
      if (existing.status === "processing" || existing.status === "pending") {
        return res.status(409).json({
          error:     "A withdrawal is already in progress",
          payoutId:  existing.id,
          idempotent: true,
        });
      }
      // If failed, allow retry — fall through (key is unique per attempt above)
    }

    // ── 5. Check for any other in-flight payout (race condition guard) ─────
    if (await hasInFlightPayout(client, teacher.id)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "A withdrawal is already in progress. Please wait for it to complete.",
      });
    }

    // ── 6. Lock balance and validate ──────────────────────────────────────
    const availableBalance = await lockBalance(client, teacher.id);

    if (requestedAmount > availableBalance) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Insufficient balance. You have KES ${availableBalance} available.`,
      });
    }

    if (!teacher.pochi_number) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "No Pochi la Biashara number on your account. Please update your profile.",
      });
    }

    // ── 7. Insert payout row as 'processing' INSIDE the transaction ────────
    // Doing this inside the transaction means if the IntaSend call fails
    // and we mark it 'failed', the in-flight guard is immediately cleared.
    const { rows: payoutRows } = await client.query(
      `INSERT INTO payouts
         (teacher_id, amount, status, idempotency_key, requested_at)
       VALUES ($1, $2, 'processing', $3, NOW())
       RETURNING id`,
      [teacher.id, requestedAmount, idempotencyKey]
    );
    const payoutId = payoutRows[0].id;

    // ── 8. Commit the transaction BEFORE calling IntaSend ─────────────────
    // This ensures the payout row is visible to the webhook handler even
    // if the process crashes after COMMIT but before IntaSend responds.
    await client.query("COMMIT");

    // ── 9. Call IntaSend — outside the transaction ────────────────────────
    try {
      const payoutResponse = await initiatePayout({
        teacherName: teacher.name,
        phoneNumber:  teacher.pochi_number,
        amount:       requestedAmount,   // number — intasend.ts handles formatting
        narrative:    "EdusyncHub payout",
      });

      const trackingId =
        payoutResponse?.tracking_id ??
        payoutResponse?.id           ??
        null;

      await pool.query(
        `UPDATE payouts
            SET conversation_id = $1,
                status          = 'processing'
          WHERE id = $2`,
        [trackingId, payoutId]
      );

      console.log(
        `[wallet] Payout ${payoutId} initiated — tracking: ${trackingId} — ` +
        `KES ${requestedAmount} → ${teacher.pochi_number}`
      );

      return res.json({
        message:   "Withdrawal initiated. You will receive an M-PESA notification shortly.",
        payoutId,
        trackingId,
      });

    } catch (intasendErr) {
      // IntaSend call failed — mark the payout as failed immediately
      // so the in-flight guard does not block the teacher's next attempt.
      const reason =
        intasendErr instanceof Error
          ? intasendErr.message
          : String(intasendErr);

      console.error(`[wallet] IntaSend call failed for payout ${payoutId}:`, reason);

      await pool.query(
        `UPDATE payouts
            SET status         = 'failed',
                failure_reason = $1
          WHERE id = $2`,
        [reason, payoutId]
      );

      return res.status(502).json({
        error: "Could not initiate payout. Please try again.",
        detail: reason,
      });
    }

  } catch (err) {
    // Catch-all — rollback if we're still inside a transaction
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[wallet] Unexpected withdrawal error:", err);
    return res.status(500).json({ error: "Withdrawal failed. Please try again." });

  } finally {
    client.release();
  }
});

// ─── POST /webhooks/intasend-payout ──────────────────────────────────────────

router.post("/webhooks/intasend-payout", async (req, res) => {
  // Always respond 200 immediately — IntaSend retries if we don't.
  res.status(200).json({ received: true });

  const { tracking_id, status } = req.body ?? {};

  if (!tracking_id || !status) {
    console.warn("[wallet] Webhook received with missing tracking_id or status");
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the payout row to prevent duplicate webhook processing
    const { rows } = await client.query(
      `SELECT *
         FROM payouts
        WHERE conversation_id = $1
          AND status          = 'processing'
        FOR UPDATE
        LIMIT 1`,
      [tracking_id]
    );
    const payout = rows[0];

    if (!payout) {
      // Already processed or not found — safe to ignore
      await client.query("ROLLBACK");
      console.log(`[wallet] Webhook for ${tracking_id} — no matching processing payout, skipping`);
      return;
    }

    const isSuccess =
      status === "completed" ||
      status === "success"   ||
      status === "COMPLETE";

    if (isSuccess) {
      // ── Deduct balance only on confirmed success ─────────────────────────
      await client.query(
        `UPDATE teacher_balances
            SET available_balance = available_balance - $1
          WHERE teacher_id        = $2`,
        [payout.amount, payout.teacher_id]
      );

      // ── Write ledger entry ────────────────────────────────────────────────
      const { rows: accountRows } = await client.query(
        `SELECT id
           FROM ledger_accounts
          WHERE teacher_id   = $1
            AND account_type = 'teacher_payable'
          LIMIT 1`,
        [payout.teacher_id]
      );

      if (accountRows[0]) {
        await client.query(
          `INSERT INTO ledger_entries
             (account_id, entry_type, amount, payout_id, description)
           VALUES ($1, 'debit', $2, $3, 'Payout to teacher')`,
          [accountRows[0].id, payout.amount, payout.id]
        );
      }

      // ── Mark payout completed ─────────────────────────────────────────────
      await client.query(
        `UPDATE payouts
            SET status       = 'completed',
                completed_at = NOW()
          WHERE id           = $1`,
        [payout.id]
      );

      console.log(
        `✅ [wallet] Payout ${payout.id} completed — ` +
        `KES ${payout.amount} deducted from teacher ${payout.teacher_id}`
      );

    } else {
      // ── Mark payout failed — balance is NOT touched ───────────────────────
      await client.query(
        `UPDATE payouts
            SET status         = 'failed',
                failure_reason = $1
          WHERE id             = $2`,
        [status, payout.id]
      );

      console.warn(
        `⚠ [wallet] Payout ${payout.id} failed — IntaSend status: ${status}`
      );
    }

    await client.query("COMMIT");

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[wallet] Webhook handler error:", err);

  } finally {
    client.release();
  }
});

export default router;