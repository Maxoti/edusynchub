import { Router } from "express";
import { pool } from "../lib/db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireOwner } from "../middleware/requireOwner";

const router = Router();

router.use(requireAuth, requireOwner);

router.get("/purchases", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT
       p.id, p.amount, p.status, p.phone_number, p.mpesa_receipt,
       p.created_at, p.updated_at,
       pp.title AS paper_title,
       t.name AS teacher_name, t.id AS teacher_id
     FROM purchases p
     JOIN papers pp ON pp.id = p.paper_id
     JOIN teachers t ON t.id = pp.teacher_id
     ORDER BY p.created_at DESC
     LIMIT 100`
  );
  return res.json(rows);
});

router.get("/payouts", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT
       po.id, po.amount, po.status, po.failure_reason,
       po.requested_at, po.completed_at,
       t.name AS teacher_name, t.pochi_number, t.id AS teacher_id
     FROM payouts po
     JOIN teachers t ON t.id = po.teacher_id
     ORDER BY po.requested_at DESC
     LIMIT 100`
  );
  return res.json(rows);
});

router.get("/balances", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT tb.teacher_id, tb.name, tb.available_balance
     FROM teacher_balances tb
     WHERE tb.available_balance > 0
     ORDER BY tb.available_balance DESC`
  );
  return res.json(rows);
});

// Manual completion — for payouts sent by hand (M-Pesa direct) rather
// than through an automated provider. Writes the same ledger debit AND
// the same balance deduction a provider webhook would have written, so
// available_balance and the ledger never diverge regardless of which
// completion path was used.
router.post("/payouts/:id/complete", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the payout row first — prevents this route being called twice
    // concurrently (e.g. two admin tabs) from double-completing the same payout.
    const payoutRow = await client.query(
      `SELECT * FROM payouts WHERE id = $1 AND status != 'completed' FOR UPDATE`,
      [req.params.id]
    );
    const payout = payoutRow.rows[0];
    if (!payout) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Payout not found or already completed" });
    }

    // Lock the teacher's balance row — mirrors lockBalance() in wallet.ts.
    // Without this, a manual completion here could race against a teacher-
    // initiated /withdraw request reading a stale balance concurrently.
    const balanceRow = await client.query(
      `SELECT available_balance FROM teacher_balances WHERE teacher_id = $1 FOR UPDATE`,
      [payout.teacher_id]
    );
    if (!balanceRow.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Teacher balance record not found" });
    }

    const accountRow = await client.query(
      `SELECT id FROM ledger_accounts WHERE teacher_id = $1 AND account_type = 'teacher_payable'`,
      [payout.teacher_id]
    );
    if (!accountRow.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Ledger account not found for this teacher" });
    }

    await client.query(
      `INSERT INTO ledger_entries (account_id, entry_type, amount, payout_id, description)
       VALUES ($1, 'debit', $2, $3, 'Manual payout (marked complete by admin)')`,
      [accountRow.rows[0].id, payout.amount, payout.id]
    );

    // Deduct available_balance — this is the step the previous version
    // of this route was missing, causing balance and ledger to diverge
    // whenever a payout was completed manually instead of via webhook.
    await client.query(
      `UPDATE teacher_balances
          SET available_balance = available_balance - $1
        WHERE teacher_id = $2`,
      [payout.amount, payout.teacher_id]
    );

    await client.query(
      `UPDATE payouts SET status = 'completed', completed_at = now() WHERE id = $1`,
      [payout.id]
    );

    await client.query("COMMIT");
    return res.json({ completed: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Manual payout completion failed:", err);
    return res.status(500).json({ error: "Could not complete payout" });
  } finally {
    client.release();
  }
});

export default router;