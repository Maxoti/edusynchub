import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { pool } from "../lib/db";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface StkCallbackItem {
  Name: string;
  Value?: string | number;
}

interface StkCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: StkCallbackItem[];
      };
    };
  };
}

interface DarajaResultParameter {
  Key: string;
  Value: string | number;
}

interface DarajaB2CResult {
  ConversationID?: string;
  OriginatorConversationID?: string;
  ResultCode: number;
  ResultDesc?: string;
  ResultParameters?: {
    ResultParameter: DarajaResultParameter[];
  };
}

interface PayoutRow {
  id: string;
  teacher_id: string;
  amount: number;
  conversation_id: string;
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────

/** Flattens Daraja's CallbackMetadata.Item array (STK) into a plain object. */
function flattenStkMetadata(items: StkCallbackItem[] | undefined): Record<string, string | number> {
  if (!items) return {};
  return Object.fromEntries(items.map((item) => [item.Name, item.Value ?? ""]));
}

/** Flattens Daraja's ResultParameters.ResultParameter array (B2C) into a plain object. */
function flattenB2CResultParameters(result: DarajaB2CResult): Record<string, string | number> {
  const list = result.ResultParameters?.ResultParameter ?? [];
  return Object.fromEntries(list.map((p) => [p.Key, p.Value]));
}

async function findProcessingPayout(conversationId: string | undefined): Promise<PayoutRow | null> {
  if (!conversationId) return null;

  const { rows } = await pool.query<PayoutRow>(
    `SELECT * FROM payouts WHERE conversation_id = $1 AND status = 'processing'`,
    [conversationId]
  );
  return rows[0] ?? null;
}

/**
 * Credits the teacher's ledger account and marks a payout as completed.
 * Used by the B2C result handler on success.
 */
async function completePayout(
  client: import("pg").PoolClient,
  payout: PayoutRow,
  opts: { mpesaReceipt?: string | null; sourceEventType: string; rawPayload: unknown }
) {
  const accountRow = await client.query(
    `SELECT id FROM ledger_accounts WHERE teacher_id = $1 AND account_type = 'teacher_payable'`,
    [payout.teacher_id]
  );
  const accountId = accountRow.rows[0]?.id;
  if (!accountId) {
    throw new Error(`No teacher_payable ledger account found for teacher ${payout.teacher_id}`);
  }

  await client.query(
    `INSERT INTO ledger_entries (account_id, entry_type, amount, payout_id, description)
     VALUES ($1, 'debit', $2, $3, 'Payout to teacher')`,
    [accountId, payout.amount, payout.id]
  );

  await client.query(
    `UPDATE payouts
     SET status = 'completed', completed_at = now(), mpesa_receipt = $1
     WHERE id = $2`,
    [opts.mpesaReceipt ?? null, payout.id]
  );

  await client.query(
    `INSERT INTO payment_events (payout_id, checkout_request_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [payout.id, payout.conversation_id, opts.sourceEventType, JSON.stringify(opts.rawPayload)]
  );
}

async function failPayout(client: import("pg").PoolClient, payout: PayoutRow, reason: string) {
  await client.query(
    `UPDATE payouts SET status = 'failed', failure_reason = $1 WHERE id = $2`,
    [reason, payout.id]
  );
}

/** Wraps a DB update in a transaction with rollback on error and tagged error logging. */
async function withTransaction(
  routeName: string,
  fn: (client: import("pg").PoolClient) => Promise<void>
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[webhooks:${routeName}] transaction failed:`, err);
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Daraja STK Push — collections
//
// Fired by Safaricom against DARAJA_SUBSCRIPTION_CALLBACK_URL after the
// customer completes (or cancels/fails) the STK prompt triggered by
// initiateSubscriptionStkPush() in lib/daraja.ts.
// ─────────────────────────────────────────────────────────────────────────

router.post("/stk-callback", async (req: Request, res: Response) => {
  const body = req.body as StkCallbackBody;
  const callback = body?.Body?.stkCallback;

  if (!callback) {
    console.warn("[webhooks:stk-callback] unexpected payload shape:", JSON.stringify(req.body));
    return res.status(200).json({ received: true });
  }

  return handleStkCallback(callback, res);
});

async function handleStkCallback(
  callback: StkCallbackBody["Body"]["stkCallback"],
  res: Response
) {
  const { CheckoutRequestID, ResultCode, CallbackMetadata } = callback;

  const { rows } = await pool.query(
    `SELECT * FROM purchases WHERE checkout_request_id = $1`,
    [CheckoutRequestID]
  );
  const purchase = rows[0];

  if (!purchase || purchase.status !== "pending") {
    return res.status(200).json({ received: true });
  }

  // ResultCode 0 = success. Anything else = customer cancelled, insufficient
  // funds, timed out, etc. - all treated as a failed attempt.
  if (ResultCode !== 0) {
    await pool.query(
      `UPDATE purchases SET status = 'failed', updated_at = now() WHERE id = $1`,
      [purchase.id]
    );
    return res.status(200).json({ received: true });
  }

  const metadata = flattenStkMetadata(CallbackMetadata?.Item);
  const mpesaReceipt = (metadata.MpesaReceiptNumber as string) ?? null;
  const phoneNumber = metadata.PhoneNumber ? String(metadata.PhoneNumber) : purchase.phone_number;

  await withTransaction("stk-callback", async (client) => {
    const downloadToken = randomBytes(24).toString("hex");

    await client.query(
      `UPDATE purchases
       SET status = 'paid', download_token = $1,
           token_expires_at = now() + interval '24 hours',
           mpesa_receipt = $2, updated_at = now()
       WHERE id = $3`,
      [downloadToken, mpesaReceipt, purchase.id]
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
       VALUES ($1, $2, $3, 'stk_collection_complete', $4)`,
      [purchase.id, CheckoutRequestID, phoneNumber, JSON.stringify(callback)]
    );
  });

  return res.status(200).json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────
// Daraja B2C — payouts
//
// B2C is asynchronous: the initial HTTP response to sendB2CPayment() only
// confirms Safaricom accepted the request. The actual outcome arrives
// later on one of these two URLs.
// ─────────────────────────────────────────────────────────────────────────

router.post("/b2c-result", async (req: Request, res: Response) => {
  const result = (req.body?.Result ?? {}) as DarajaB2CResult;
  return handleB2CResultEvent(result, res);
});

router.post("/b2c-timeout", async (req: Request, res: Response) => {
  const result = (req.body?.Result ?? {}) as DarajaB2CResult;
  console.warn("[webhooks:b2c-timeout] payload:", JSON.stringify(req.body));
  return handleB2CResultEvent(result, res);
});

async function handleB2CResultEvent(result: DarajaB2CResult, res: Response) {
  const conversationId = result.ConversationID ?? result.OriginatorConversationID;

  const payout = await findProcessingPayout(conversationId);
  if (!payout) {
    return res.status(200).json({ received: true });
  }

  await withTransaction("b2c-result", async (client) => {
    if (result.ResultCode === 0) {
      const params = flattenB2CResultParameters(result);
      await completePayout(client, payout, {
        mpesaReceipt: (params.TransactionReceipt as string) ?? null,
        sourceEventType: "b2c_payout_complete",
        rawPayload: result,
      });
    } else {
      await failPayout(client, payout, result.ResultDesc ?? JSON.stringify(result));
    }
  });

  return res.status(200).json({ received: true });
}

export default router;