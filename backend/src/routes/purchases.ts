import { Router } from "express";
import { pool } from "../lib/db";
import { initiateCollection } from "../lib/intasend";
import { getPresignedDownloadUrl } from "../lib/r2";

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
      amount: paper.price,
      apiRef: `purchase-${purchaseId}`,
    });

    await pool.query(
      `UPDATE purchases SET checkout_request_id = $1 WHERE id = $2`,
      [collectionResponse.invoice.invoice_id, purchaseId]
    );

    return res.status(201).json({
      purchaseId,
      message: "Payment initiated. Complete it on your phone.",
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

// Parent polls this after paying, to know when the webhook has confirmed.
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

// Actually retrieve the file, once paid. The download_token is the
// one-time-use credential - anyone who has it can download once, so it
// only ever gets handed to the browser after status is confirmed paid.
router.get("/purchases/:purchaseId/download", async (req, res) => {
  const { token } = req.query;

  const { rows } = await pool.query(
    `SELECT p.status, p.download_token, p.token_expires_at, p.token_used, pp.file_key
     FROM purchases p
     JOIN papers pp ON pp.id = p.paper_id
     WHERE p.id = $1`,
    [req.params.purchaseId]
  );
  const purchase = rows[0];

  if (!purchase || purchase.status !== "paid") {
    return res.status(404).json({ error: "Purchase not found or not yet paid" });
  }
  if (purchase.download_token !== token) {
    return res.status(403).json({ error: "Invalid download link" });
  }
  if (purchase.token_used) {
    return res.status(410).json({ error: "This download link has already been used" });
  }
  if (new Date(purchase.token_expires_at) < new Date()) {
    return res.status(410).json({ error: "This download link has expired" });
  }

  try {
    const url = await getPresignedDownloadUrl(purchase.file_key);
    await pool.query(`UPDATE purchases SET token_used = true WHERE id = $1`, [req.params.purchaseId]);
    return res.json({ url });
  } catch (err) {
    console.error("Failed to generate download URL:", err);
    return res.status(502).json({ error: "Could not generate download link" });
  }
});

export default router;
