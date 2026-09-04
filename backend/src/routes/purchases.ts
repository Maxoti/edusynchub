import { Router } from "express";
import { pool } from "../lib/db";
import { initiateCollection } from "../lib/intasend";

const router = Router();

// No auth - parents are anonymous buyers, identified only by phone/email
// at purchase time.
router.post("/:paperId/purchase", async (req, res) => {
  const paperId = Number(req.params.paperId);
  const { phoneNumber, email, firstName, lastName } = req.body ?? {};

  if (!phoneNumber || !email) {
    return res.status(400).json({ error: "phoneNumber and email are required" });
  }

  const paperRow = await pool.query(
    `SELECT id, title, price, active FROM papers WHERE id = $1`,
    [paperId]
  );
  const paper = paperRow.rows[0];

  if (!paper || !paper.active) {
    return res.status(404).json({ error: "Paper not found or no longer available" });
  }

  const inserted = await pool.query(
    `INSERT INTO purchases (paper_id, phone_number, amount, status, email)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id`,
    [paper.id, phoneNumber, paper.price, email]
  );
  const purchaseId = inserted.rows[0].id;

  try {
    const collectionResponse = await initiateCollection({
      phoneNumber,
      email,
      firstName: firstName || "Parent",
      lastName: lastName || "Buyer",
      amount: paper.price,
      apiRef: `purchase-${purchaseId}`,
    });

    await pool.query(
      `UPDATE purchases SET checkout_request_id = $1 WHERE id = $2`,
      [collectionResponse.invoice_id, purchaseId]
    );

    return res.status(201).json({
      purchaseId,
      message: "Payment initiated. Complete it on your phone.",
      checkoutUrl: collectionResponse.url ?? null,
    });
  } catch (err) {
    console.error("IntaSend collection failed:", err);
    await pool.query(
      `UPDATE purchases SET status = 'failed', updated_at = now() WHERE id = $1`,
      [purchaseId]
    );
    return res.status(502).json({ error: "Could not initiate payment" });
  }
});

// Parent polls this after paying. Actual file delivery (R2 presigned
// URL) is still missing - this returns purchase status only.
router.get("/purchases/:purchaseId/status", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT status, download_token, token_expires_at, token_used
     FROM purchases WHERE id = $1`,
    [req.params.purchaseId]
  );
  const purchase = rows[0];
  if (!purchase) {
    return res.status(404).json({ error: "Purchase not found" });
  }
  return res.json(purchase);
});

export default router;
