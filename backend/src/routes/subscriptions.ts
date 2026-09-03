import { Router } from "express";
import { pool } from "../lib/db";
import { initiateSubscriptionStkPush } from "../lib/daraja";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

const REGISTRATION_FEE_KES = 499;

router.post("/pay", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `SELECT id, phone_number, name FROM teachers WHERE id = $1`,
    [req.teacherId]
  );
  const teacher = rows[0];
  if (!teacher) {
    return res.status(404).json({ error: "Teacher not found" });
  }

  try {
    const stkResponse = await initiateSubscriptionStkPush({
      phoneNumber: teacher.phone_number,
      amount: REGISTRATION_FEE_KES,
      accountReference: `EdusyncHub-${teacher.id}`,
    });

    await pool.query(
      `INSERT INTO subscription_payments
         (teacher_id, checkout_request_id, merchant_request_id, amount, status)
       VALUES ($1, $2, $3, $4, ''pending'')`,
      [
        teacher.id,
        stkResponse.CheckoutRequestID,
        stkResponse.MerchantRequestID,
        REGISTRATION_FEE_KES,
      ]
    );

    return res.json({ message: "STK push sent. Check your phone." });
  } catch (err) {
    console.error("Subscription STK push failed:", err);
    return res.status(502).json({ error: "Could not initiate payment" });
  }
});

router.post("/webhooks/daraja", async (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  if (!callback) {
    return res.status(400).json({ error: "Malformed callback payload" });
  }

  const checkoutRequestId = callback.CheckoutRequestID;
  const resultCode = callback.ResultCode;

  const { rows } = await pool.query(
    `SELECT * FROM subscription_payments WHERE checkout_request_id = $1`,
    [checkoutRequestId]
  );
  const payment = rows[0];

  if (!payment || payment.status !== "pending") {
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  if (resultCode !== 0) {
    await pool.query(
      `UPDATE subscription_payments SET status = ''failed'', updated_at = now() WHERE id = $1`,
      [payment.id]
    );
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const items: Array<{ Name: string; Value: unknown }> =
    callback.CallbackMetadata?.Item ?? [];
  const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE subscription_payments
       SET status = ''paid'', mpesa_receipt = $1, updated_at = now()
       WHERE id = $2`,
      [receipt, payment.id]
    );

    await client.query(
      `INSERT INTO subscriptions (teacher_id, tier, status, expires_at)
       VALUES ($1, ''monthly'', ''active'', now() + interval ''30 days'')`,
      [payment.teacher_id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to activate subscription:", err);
  } finally {
    client.release();
  }

  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
});

export default router;
