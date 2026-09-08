/**
 * Thin client around IntaSend's "Send Money" (B2C payout) API.
 *
 * Docs: https://developers.intasend.com/docs/send-money
 *
 * Required env vars:
 *   INTASEND_SECRET_KEY       - your IntaSend secret/API key (starts with ISSecretKey_)
 *   INTASEND_PUBLISHABLE_KEY  - your IntaSend publishable key (starts with ISPubKey_)
 *   INTASEND_ENV              - "test" | "live" (defaults to "test")
 */

const INTASEND_SECRET_KEY = process.env.INTASEND_SECRET_KEY;
const INTASEND_PUBLISHABLE_KEY = process.env.INTASEND_PUBLISHABLE_KEY;
const INTASEND_ENV = process.env.INTASEND_ENV === "live" ? "live" : "test";

const BASE_URL =
  INTASEND_ENV === "live"
    ? "https://payment.intasend.com/api/v1"
    : "https://sandbox.intasend.com/api/v1";

if (!INTASEND_SECRET_KEY || !INTASEND_PUBLISHABLE_KEY) {
  // Fail loudly at boot rather than silently 500-ing on first withdrawal.
  console.warn(
    "[intasend] INTASEND_SECRET_KEY or INTASEND_PUBLISHABLE_KEY is not set — payouts will fail."
  );
}

export interface InitiatePayoutParams {
  teacherName: string;
  phoneNumber: string;
  amount: number;
  narrative: string;
}

export interface IntaSendTransactionResult {
  status: string;
  account: string;
  amount: number;
  name: string;
  narrative?: string;
  transaction_id?: string;
  reference?: string;
}

export interface InitiatePayoutResponse {
  id?: string;
  tracking_id: string;
  status: string;
  provider: string;
  currency: string;
  transactions?: IntaSendTransactionResult[];
  [key: string]: unknown;
}

/**
 * Normalizes a Kenyan phone number to the 2547XXXXXXXX / 2541XXXXXXXX
 * format IntaSend expects for M-PESA disbursements.
 */
function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("254") && digits.length === 12) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) {
    return `254${digits}`;
  }

  throw new Error(`Unrecognized phone number format: ${raw}`);
}

/**
 * Initiates a single M-PESA B2C payout via IntaSend.
 * Throws on network/API errors — the caller (wallet.ts) is responsible
 * for catching this and marking the payout as failed.
 */
export async function initiatePayout(
  params: InitiatePayoutParams
): Promise<InitiatePayoutResponse> {
  const { teacherName, phoneNumber, amount, narrative } = params;

  if (!INTASEND_SECRET_KEY) {
    throw new Error("INTASEND_SECRET_KEY is not configured");
  }
  if (amount <= 0) {
    throw new Error(`Payout amount must be positive, got ${amount}`);
  }

  const account = normalizePhoneNumber(phoneNumber);

  const payload = {
    currency: "KES",
    provider: "MPESA-B2C",
    requires_approval: "YES",
    transactions: [
      {
        name: teacherName,
        account,
        amount: amount.toFixed(2),
        narrative,
      },
    ],
  };

  const response = await fetch(`${BASE_URL}/send-money/initiate/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTASEND_SECRET_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (body && (body.detail || body.message || JSON.stringify(body))) ||
      `IntaSend payout request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!body || (!body.tracking_id && !body.id)) {
    throw new Error(
      `IntaSend payout response missing tracking id: ${JSON.stringify(body)}`
    );
  }

  return body as InitiatePayoutResponse;
}

/**
 * Optional: check the status of a previously initiated payout batch.
 * Useful for reconciliation jobs if the webhook is ever missed.
 */
export async function getPayoutStatus(
  trackingId: string
): Promise<InitiatePayoutResponse> {
  if (!INTASEND_SECRET_KEY) {
    throw new Error("INTASEND_SECRET_KEY is not configured");
  }

  const response = await fetch(`${BASE_URL}/send-money/status/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTASEND_SECRET_KEY}`,
    },
    body: JSON.stringify({ tracking_id: trackingId }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (body && (body.detail || body.message || JSON.stringify(body))) ||
      `IntaSend status check failed with status ${response.status}`;
    throw new Error(message);
  }

  return body as InitiatePayoutResponse;
}
/**
 * Thin client around IntaSend's M-Pesa STK Push (Payment Collection) API.
 *
 * Docs: https://developers.intasend.com/docs/m-pesa-stk-push
 * Confirmed request/response shape via IntaSend's OpenAPI spec directly -
 * this endpoint only accepts amount, phone_number, and api_ref (no email
 * or name fields), and returns the invoice nested under response.invoice.
 */

export interface InitiateCollectionParams {
  phoneNumber: string;
  amount: number;
  apiRef: string;
}

export interface IntaSendInvoice {
  invoice_id: string;
  state: "PENDING" | "PROCESSING" | "FAILED" | "CANCELED" | "PARTIAL" | "COMPLETE" | "RETRY";
  provider: string;
  net_amount?: string;
  currency: string;
  value?: string;
  account?: string;
  api_ref?: string;
}

export interface InitiateCollectionResponse {
  id: string;
  invoice: IntaSendInvoice;
  [key: string]: unknown;
}

export async function initiateCollection(
  params: InitiateCollectionParams
): Promise<InitiateCollectionResponse> {
  const { phoneNumber, amount, apiRef } = params;

  if (!INTASEND_SECRET_KEY) {
    throw new Error("INTASEND_SECRET_KEY is not configured");
  }
  if (amount <= 0) {
    throw new Error(`Collection amount must be positive, got ${amount}`);
  }

  const account = normalizePhoneNumber(phoneNumber);

  const payload = {
    amount: amount.toFixed(2),
    phone_number: account,
    api_ref: apiRef,
  };

  const response = await fetch(`${BASE_URL}/payment/mpesa-stk-push/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTASEND_SECRET_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (body && (body.detail || body.message || JSON.stringify(body))) ||
      `IntaSend STK Push request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!body || !body.invoice || !body.invoice.invoice_id) {
    throw new Error(
      `IntaSend STK Push response missing invoice: ${JSON.stringify(body)}`
    );
  }

  return body as InitiateCollectionResponse;
}