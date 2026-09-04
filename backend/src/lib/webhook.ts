import { Router } from "express";
import { randomBytes, timingSafeEqual } from "crypto";
import { pool } from "../lib/db";

const router = Router();

// Change #1: timing-safe comparison for the shared challenge string.
// It's not an HMAC, but a plain `!==` still leaks timing info about how
// many leading bytes matched. Cheap to fix, no reason not to.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// IntaSend sends ALL event types (collection + payout) to this single
// endpoint — there's no separate URL per event type. We branch on the
// payload shape instead.
router.post("/intasend", async (req, res) => {
  const body = req.body ?? {};
  const challenge = process.env.INTASEND_WEBHOOK_CHALLENGE;

  if (!challenge || typeof body.challenge !== "string" || !safeEqual(body.challenge, challenge)) {
    console.warn("IntaSend webhook: challenge mismatch, rejecting");
    return res.status(401).json({ error: "Invalid challenge" });
  }

  try {
    // Collection (purchase) events have a confirmed shape: invoice_id + state.
    if (body.invoice_id) {
      return await handleCollectionEvent(body, res);
    }

    // Payout (Send Money) events — shape NOT confirmed against IntaSend's
    // docs. Log a redacted view so you can verify field names against a
    // real test withdrawal without dumping phone numbers/amounts to logs.
    console.log("IntaSend payout webhook received. Keys:", Object.keys(body));
    return await handlePayoutEvent(body, res);
  } catch (err) {
    // Change #2: a truly unexpected error (bad JSON shape, DB connection
    // lost before we even got a client, etc.) must NOT fall through to a
    // 200. Anything that reaches here means we did nothing durable, so
    // tell IntaSend to retry.
    console.error("Unhandled webhook error:", err);
    return res.status(500).json({ received: false });
  }
});

async function handleCollectionEvent(body: any, res: any) {
  const { invoice_id, state } = body;

  if (!invoice_id || typeof state !== "string") {
    console.warn("IntaSend collection webhook missing invoice_id/state:", Object.keys(body));
    // Malformed payload isn't something a retry will fix — ack it so
    // IntaSend stops retrying, but log loudly so you notice.
    return res.status(200).json({ received: true });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Change #3: atomic claim instead of SELECT-then-UPDATE. The original
    // code read the row, decided it was "pending", and only updated it
    // later — if two webhook deliveries land close together (IntaSend
    // retries are real), both can pass the read-check before either
    // writes, double-processing the purchase (double payout to the
    // teacher, a second download token, etc). Doing the status flip as
    // the SELECT itself, using SELECT ... FOR UPDATE, closes that gap
    // inside the transaction.
    const { rows } = await client.query(
      `SELECT * FROM purchases WHERE checkout_request_id = $1 FOR UPDATE`,
      [invoice_id]
    );
    const purchase = rows[0];

    if (!purchase) {
      // Unknown invoice — ack so IntaSend doesn't retry forever, but this
      // is worth alerting on, not just logging, since it means a webhook
      // arrived for a purchase we have no record of.
      console.error("IntaSend collection webhook: unknown invoice_id", invoice_id);
      await client.query("ROLLBACK");
      return res.status(200).json({ received: true });
    }

    if (purchase.status !== "pending") {
      // Already processed (or already failed) — safe no-op, this is the
      // expected shape of a retried delivery.
      await client.query("ROLLBACK");
      return res.status(200).json({ received: true });
    }

    if (state === "FAILED") {
      await client.query(
        `UPDATE purchases SET status = 'failed', updated_at = now() WHERE id = $1`,
        [purchase.id]
      );
      await client.query("COMMIT");
      return res.status(200).json({ received: true });
    }

    if (state !== "COMPLETE") {
      // PENDING / PROCESSING — no action, wait for a later callback.
      await client.query("ROLLBACK");
      return res.status(200).json({ received: true });
    }

    // state === "COMPLETE" from here down.
    const downloadToken = cryptoRandomToken();

    // Change #4: 60 seconds was almost certainly a testing leftover — a
    // page reload or a slow network kills the link before the buyer can
    // use it. Bumped to a configurable window, defaulting to 15 minutes.
    // Adjust TOKEN_TTL_SECONDS to whatever fits your actual download flow.
    const TOKEN_TTL_SECONDS = Number(process.env.DOWNLOAD_TOKEN_TTL_SECONDS ?? 900);

    await client.query(
      `UPDATE purchases
       SET status = 'paid', download_token = $1,
           token_expires_at = now() + ($2 || ' seconds')::interval, updated_at = now()
       WHERE id = $3`,
      [downloadToken, TOKEN_TTL_SECONDS, purchase.id]
    );

    const paperRow = await client.query(
      `SELECT teacher_id, price FROM papers WHERE id = $1`,
      [purchase.paper_id]
    );
    if (paperRow.rows.length === 0) {
      // Data integrity problem, not a retry-able one — surface loudly
      // and let the outer catch roll back + return 500 so it's not
      // silently swallowed.
      throw new Error(`Paper ${purchase.paper_id} not found for purchase ${purchase.id}`);
    }
    const { teacher_id, price } = paperRow.rows[0];

    // Change #5: if `price` is a Postgres numeric/float, Math.round on a
    // float multiplication can misbehave at the edges. Assumes price is
    // already an integer count of the smallest currency unit (cents /
    // whole KES, whichever your schema uses consistently). If it isn't,
    // fix at the source rather than here.
    const teacherShare = Math.round(price * 0.7);
    const platformShare = price - teacherShare;

    const teacherAccount = await client.query(
      `SELECT id FROM ledger_accounts WHERE teacher_id = $1 AND account_type = 'teacher_payable'`,
      [teacher_id]
    );
    if (teacherAccount.rows.length === 0) {
      // Change #6: this used to be an unguarded `.rows[0].id` that would
      // throw a generic "Cannot read property 'id' of undefined" deep in
      // a stack trace. Now it's an explicit, searchable error.
      throw new Error(`No teacher_payable ledger account for teacher ${teacher_id}`);
    }

    const platformAccount = await client.query(
      `SELECT id FROM ledger_accounts WHERE teacher_id IS NULL AND account_type = 'platform_revenue'`
    );
    if (platformAccount.rows.length === 0) {
      throw new Error("No platform_revenue ledger account configured");
    }

    // Change #7: the original only ever inserted two credits with no
    // offsetting debit, so the ledger can't balance to zero — it'll
    // drift further from reconciling against IntaSend's settlement
    // reports with every purchase. Added a debit against a clearing
    // account representing the cash IntaSend is holding on your behalf.
    // If you don't have a 'collections_clearing' account type yet, add
    // one — every other line here already assumes ledger_accounts rows
    // exist per type, so this is consistent with that pattern.
    const clearingAccount = await client.query(
      `SELECT id FROM ledger_accounts WHERE teacher_id IS NULL AND account_type = 'collections_clearing'`
    );
    if (clearingAccount.rows.length === 0) {
      throw new Error("No collections_clearing ledger account configured");
    }

    await client.query(
      `INSERT INTO ledger_entries (account_id, entry_type, amount, purchase_id, description)
       VALUES ($1, 'debit', $2, $3, 'Paper purchase — cash received via IntaSend')`,
      [clearingAccount.rows[0].id, price, purchase.id]
    );
    await client.query(
      `INSERT INTO ledger_entries (account_id, entry_type, amount, purchase_id, description)
       VALUES ($1, 'credit', $2, $3, 'Paper purchase — teacher share')`,
      [teacherAccount.rows[0].id, teacherShare, purchase.id]
    );
    await client.query(
      `INSERT INTO ledger_entries (account_id, entry_type, amount, purchase_id, description)
       VALUES ($1, 'credit', $2, $3, 'Paper purchase — platform share')`,
      [platformAccount.rows[0].id, platformShare, purchase.id]
    );

    await client.query(
      `INSERT INTO payment_events (purchase_id, checkout_request_id, phone_number, event_type, payload)
       VALUES ($1, $2, $3, 'intasend_collection_complete', $4)`,
      [purchase.id, invoice_id, purchase.phone_number, JSON.stringify(body)]
    );

    await client.query("COMMIT");
    return res.status(200).json({ received: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to process purchase webhook:", err);
    // Change #2 (continued): non-2xx so IntaSend retries. The FOR UPDATE
    // lock + pending-status check above make retries safe to replay.
    return res.status(500).json({ received: false });
  } finally {
    client.release();
  }
}

async function handlePayoutEvent(body: any, res: any) {
  // Best-guess field names — confirm against a real payload before relying
  // on this. tracking_id is IntaSend's general job identifier for
  // asynchronous operations, which we store in payouts.conversation_id.
  const trackingId = body.tracking_id ?? body.id;
  const status = body.status ?? body.state;

  if (!trackingId || !status) {
    console.warn("IntaSend payout webhook missing tracking id/status. Keys:", Object.keys(body));
    return res.status(200).json({ received: true });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Same atomic-claim fix as the collection handler.
    const { rows } = await client.query(
      `SELECT * FROM payouts WHERE conversation_id = $1 AND status = 'processing' FOR UPDATE`,
      [trackingId]
    );
    const payout = rows[0];
    if (!payout) {
      await client.query("ROLLBACK");
      return res.status(200).json({ received: true });
    }

    if (status === "completed" || status === "COMPLETE" || status === "success") {
      const accountRow = await client.query(
        `SELECT id FROM ledger_accounts WHERE teacher_id = $1 AND account_type = 'teacher_payable'`,
        [payout.teacher_id]
      );
      if (accountRow.rows.length === 0) {
        throw new Error(`No teacher_payable ledger account for teacher ${payout.teacher_id}`);
      }

      await client.query(
        `INSERT INTO ledger_entries (account_id, entry_type, amount, payout_id, description)
         VALUES ($1, 'debit', $2, $3, 'Payout to teacher')`,
        [accountRow.rows[0].id, payout.amount, payout.id]
      );
      await client.query(
        `UPDATE payouts SET status = 'completed', completed_at = now() WHERE id = $1`,
        [payout.id]
      );
    } else if (status === "failed" || status === "FAILED") {
      await client.query(
        `UPDATE payouts SET status = 'failed', failure_reason = $1 WHERE id = $2`,
        [JSON.stringify(body), payout.id]
      );
    } else {
      // Unrecognized status for a payout shape you haven't fully verified
      // yet — log the full payload here (not in the outer handler) since
      // this is the one case where you genuinely need to see it to figure
      // out what IntaSend actually sends.
      console.warn("IntaSend payout webhook: unrecognized status", status, JSON.stringify(body));
    }

    await client.query("COMMIT");
    return res.status(200).json({ received: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to process payout webhook:", err);
    return res.status(500).json({ received: false });
  } finally {
    client.release();
  }
}

function cryptoRandomToken(): string {
  return randomBytes(24).toString("hex");
}

export default router;