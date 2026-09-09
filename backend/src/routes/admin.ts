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

// Manual completion - for payouts sent by hand (M-Pesa direct) rather
// than through an automated provider. Writes the same ledger debit a
// provider webhook would have written.
router.post("/payouts/:id/complete", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const payoutRow = await client.query(
      `SELECT * FROM payouts WHERE id = $1 AND status != 'completed'`,
      [req.params.id]
    );
    const payout = payoutRow.rows[0];
    if (!payout) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Payout not found or already completed" });
    }

    const accountRow = await client.query(
      `SELECT id FROM ledger_accounts WHERE teacher_id = $1 AND account_type = 'teacher_payable'`,
      [payout.teacher_id]
    );

    await client.query(
      `INSERT INTO ledger_entries (account_id, entry_type, amount, payout_id, description)
       VALUES ($1, 'debit', $2, $3, 'Manual payout (marked complete by admin)')`,
      [accountRow.rows[0].id, payout.amount, payout.id]
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
