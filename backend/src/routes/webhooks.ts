import { Router } from "express";
import { randomBytes } from "crypto";
import { pool } from "../lib/db";

const router = Router();

// IntaSend sends ALL event types (collection + payout) to this single
// endpoint - there's no separate URL per event type. We branch on the
// payload shape instead.
router.post("/intasend", async (req, res) => {
  const body = req.body ?? {};

  // IntaSend's only webhook auth is this shared "challenge" string -
  // no HMAC signature exists. INTASEND_WEBHOOK_CHALLENGE must match
  // exactly what you set on the webhook in IntaSend's dashboard.
  if (body.challenge !== process.env.INTASEND_WEBHOOK_CHALLENGE) {
    console.warn("IntaSend webhook: challenge mismatch, rejecting");
    return res.status(401).json({ error: "Invalid challenge" });
  }

  // Collection (purchase) events have a confirmed shape: invoice_id + state.
  if (body.invoice_id) {
    return handleCollectionEvent(body, res);
  }

  // Payout (Send Money) events - shape NOT confirmed against IntaSend's
  // docs. Logging the raw payload so you can verify field names against
  // a real test withdrawal before trusting this branch in production.
  console.log("IntaSend payout webhook payload (verify shape):", JSON.stringify(body));
  return handlePayoutEvent(body, res);
});

async function handleCollectionEvent(body: any, res: any) {
  const { invoice_id, state } = body;

  const { rows } = await pool.query(
    `SELECT * FROM purchases WHERE checkout_request_id = $1`,
    [invoice_id]
  );
  const purchase = rows[0];

  if (!purchase || purchase.status !== "pending") {
    return res.status(200).json({ received: true });
  }

  if (state !== "COMPLETE") {
    if (state === "FAILED") {
      await pool.query(
        `UPDATE purchases SET status = 'failed', updated_at = now() WHERE id = $1`,
        [purchase.id]
      );
    }
    return res.status(200).json({ received: true });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const downloadToken = randomBytes(24).toString("hex");

    await client.query(
      `UPDATE purchases
       SET status = 'paid', download_token = $1,
           token_expires_at = now() + interval '24 hours', updated_at = now()
       WHERE id = $2`,
      [downloadToken, purchase.id]
    );

    const paperRow = await client.query(
      `SELECT teacher_id, price FROM papers WHERE id = $1`,
      [purchase.paper_id]
    );
    const { teacher_id, price } = paperRow.rows[0];

    const teacherShare = Math.round(price * 0.855);
    const platformShare = price - teacherShare;

    const teacherAccount = await client.query(
      `SELECT id FROM ledger_accounts WHERE teacher_id = $1 AND account_type = 'teacher_payable'`,
      [teacher_id]
    );
    const platformAccount = await client.query(
      `SELECT id FROM ledger_accounts WHERE teacher_id IS NULL AND account_type = 'platform_revenue'`
    );

    await client.query(
      `INSERT INTO ledger_entries (account_id, entry_type, amount, purchase_id, description)
       VALUES ($1, 'credit', $2, $3, 'Paper purchase - teacher share')`,
      [teacherAccount.rows[0].id, teacherShare, purchase.id]
    );
    await client.query(
      `INSERT INTO ledger_entries (account_id, entry_type, amount, purchase_id, description)
       VALUES ($1, 'credit', $2, $3, 'Paper purchase - platform share')`,
      [platformAccount.rows[0].id, platformShare, purchase.id]
    );

    await client.query(
      `INSERT INTO payment_events (purchase_id, checkout_request_id, phone_number, event_type, payload)
       VALUES ($1, $2, $3, 'intasend_collection_complete', $4)`,
      [purchase.id, invoice_id, purchase.phone_number, JSON.stringify(body)]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to process purchase webhook:", err);
  } finally {
    client.release();
  }

  return res.status(200).json({ received: true });
}

async function handlePayoutEvent(body: any, res: any) {
  const trackingId = body.tracking_id ?? body.id;
  const status = body.status ?? body.state;

  const { rows } = await pool.query(
    `SELECT * FROM payouts WHERE conversation_id = $1 AND status = 'processing'`,
    [trackingId]
  );
  const payout = rows[0];
  if (!payout) {
    return res.status(200).json({ received: true });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (status === "completed" || status === "COMPLETE" || status === "success") {
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
    } else if (status === "failed" || status === "FAILED") {
      await client.query(
        `UPDATE payouts SET status = 'failed', failure_reason = $1 WHERE id = $2`,
        [JSON.stringify(body), payout.id]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to process payout webhook:", err);
  } finally {
    client.release();
  }

  return res.status(200).json({ received: true });
}

export default router;

