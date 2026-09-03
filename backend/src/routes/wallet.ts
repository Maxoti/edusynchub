import { Router } from "express";
import { pool } from "../lib/db";
import { initiatePayout } from "../lib/intasend";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

const MIN_WITHDRAWAL_KES = 200;

router.get("/balance", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT available_balance FROM teacher_balances WHERE teacher_id = $1`,
    [req.teacherId]
  );
  const availableBalance = rows[0]?.available_balance ?? 0;

  return res.json({
    availableBalance,
    minWithdrawal: MIN_WITHDRAWAL_KES,
    canWithdraw: availableBalance >= MIN_WITHDRAWAL_KES,
  });
});

router.post("/withdraw", requireAuth, async (req: AuthedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const teacherRow = await client.query(
      `SELECT id, name, pochi_number FROM teachers WHERE id = $1 FOR UPDATE`,
      [req.teacherId]
    );
    const teacher = teacherRow.rows[0];
    if (!teacher) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Teacher not found" });
    }

    const inFlight = await client.query(
      `SELECT id FROM payouts WHERE teacher_id = $1 AND status IN ('pending', 'processing')`,
      [teacher.id]
    );
    if (inFlight.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "A withdrawal is already in progress" });
    }

    const balanceRow = await client.query(
      `SELECT available_balance FROM teacher_balances WHERE teacher_id = $1`,
      [teacher.id]
    );
    const availableBalance = balanceRow.rows[0]?.available_balance ?? 0;

    if (availableBalance < MIN_WITHDRAWAL_KES) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Minimum withdrawal is KES ${MIN_WITHDRAWAL_KES}. Current balance: KES ${availableBalance}`,
      });
    }

    const payoutRow = await client.query(
      `INSERT INTO payouts (teacher_id, amount, status)
       VALUES ($1, $2, 'processing')
       RETURNING id`,
      [teacher.id, availableBalance]
    );
    const payoutId = payoutRow.rows[0].id;

    await client.query("COMMIT");

    try {
      const payoutResponse = await initiatePayout({
        teacherName: teacher.name,
        phoneNumber: teacher.pochi_number,
        amount: availableBalance,
        narrative: "EdusyncHub payout",
      });

      await pool.query(
        `UPDATE payouts SET conversation_id = $1 WHERE id = $2`,
        [payoutResponse?.tracking_id ?? payoutResponse?.id ?? null, payoutId]
      );

      return res.json({ message: "Withdrawal initiated", payoutId });
    } catch (err) {
      console.error("IntaSend payout call failed:", err);
      await pool.query(
        `UPDATE payouts SET status = 'failed', failure_reason = $1 WHERE id = $2`,
        [String(err), payoutId]
      );
      return res.status(502).json({ error: "Could not initiate payout" });
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Withdrawal failed:", err);
    return res.status(500).json({ error: "Withdrawal failed" });
  } finally {
    client.release();
  }
});

router.post("/webhooks/intasend-payout", async (req, res) => {
  const { tracking_id, status } = req.body ?? {};

  const { rows } = await pool.query(
    `SELECT * FROM payouts WHERE conversation_id = $1 AND status = 'processing'`,
    [tracking_id]
  );
  const payout = rows[0];
  if (!payout) {
    return res.status(200).json({ received: true });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (status === "completed" || status === "success") {
      const accountRow = await client.query(
        `SELECT id FROM ledger_accounts WHERE teacher_id = $1 AND account_type = 'teacher_payable'`,
        [payout.teacher_id]
      );
      await client.query(
        `INSERT INTO ledger_entries (account_id, entry_type, amount, payout_id, description)
         VALUES ($1, 'debit', $2, $3, 'Payout to teacher')`,
        [accountRow.rows[0].id, payout.amount, payout.id]
      );
      await client.query(
        `UPDATE payouts SET status = 'completed', completed_at = now() WHERE id = $1`,
        [payout.id]
      );
    } else {
      await client.query(
        `UPDATE payouts SET status = 'failed', failure_reason = $1 WHERE id = $2`,
        [status, payout.id]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Payout webhook handling failed:", err);
  } finally {
    client.release();
  }

  return res.status(200).json({ received: true });
});

export default router;