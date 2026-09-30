import crypto from "crypto";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────
// STK Push (collections) — LIVE, handling real customer payments.
// Controlled by DARAJA_ENV / DARAJA_CONSUMER_KEY / DARAJA_CONSUMER_SECRET.
// ─────────────────────────────────────────────────────────────────────────

const DARAJA_BASE_URL =
  process.env.DARAJA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

const CERT_PATH =
  process.env.DARAJA_ENV === "production"
    ? path.join(__dirname, "../certs/ProductionCertificate.cer")
    : path.join(__dirname, "../certs/SandboxCertificate.cer");

async function getDarajaToken(
  baseUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<string> {
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64"
  );

  const res = await fetch(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${credentials}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Daraja OAuth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

function darajaTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function generateSecurityCredential(initiatorPassword: string, certPath: string): string {
  const cert = fs.readFileSync(certPath, "utf8");
  const encrypted = crypto.publicEncrypt(
    { key: cert, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(initiatorPassword)
  );
  return encrypted.toString("base64");
}

interface SubscriptionStkPushParams {
  phoneNumber: string;
  amount: number;
  accountReference: string;
}

export async function initiateSubscriptionStkPush(
  params: SubscriptionStkPushParams
) {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY as string;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET as string;
  const token = await getDarajaToken(DARAJA_BASE_URL, consumerKey, consumerSecret);

  const shortcode = process.env.DARAJA_SHORTCODE as string;
  const passkey = process.env.DARAJA_PASSKEY as string;
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString(
    "base64"
  );

  const res = await fetch(`${DARAJA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: params.amount,
      PartyA: params.phoneNumber,
      PartyB: shortcode,
      PhoneNumber: params.phoneNumber,
      CallBackURL: process.env.DARAJA_SUBSCRIPTION_CALLBACK_URL,
      AccountReference: params.accountReference,
      TransactionDesc: "EdusyncHub monthly activation",
    }),
  });

  if (!res.ok) {
    throw new Error(`Daraja STK Push failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────
// B2C (teacher payouts) — deliberately isolated from STK above.
//
// Own environment toggle (DARAJA_B2C_ENV), own consumer key/secret pair
// (a sandbox app's credentials differ from a production app's on the
// Daraja portal), own cert path. Flipping this to sandbox for testing
// cannot affect live STK Push collections above.
// ─────────────────────────────────────────────────────────────────────────

const DARAJA_B2C_BASE_URL =
  process.env.DARAJA_B2C_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

const B2C_CERT_PATH =
  process.env.DARAJA_B2C_ENV === "production"
    ? path.join(__dirname, "../certs/ProductionCertificate.cer")
    : path.join(__dirname, "../certs/SandboxCertificate.cer");

interface B2CPaymentParams {
  amount: number;
  phoneNumber: string; // format: 2547XXXXXXXX
  remarks: string;
  occasion?: string;
}

export async function sendB2CPayment(params: B2CPaymentParams) {
  const consumerKey = process.env.DARAJA_B2C_CONSUMER_KEY as string;
  const consumerSecret = process.env.DARAJA_B2C_CONSUMER_SECRET as string;
  const token = await getDarajaToken(DARAJA_B2C_BASE_URL, consumerKey, consumerSecret);

  const initiatorName = process.env.DARAJA_INITIATOR_NAME as string;
  const initiatorPassword = process.env.DARAJA_INITIATOR_PASSWORD as string;
  const b2cShortcode = process.env.DARAJA_B2C_SHORTCODE as string;
  const securityCredential = generateSecurityCredential(initiatorPassword, B2C_CERT_PATH);

  const res = await fetch(`${DARAJA_B2C_BASE_URL}/mpesa/b2c/v3/paymentrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: "BusinessPayment",
      Amount: params.amount,
      PartyA: b2cShortcode,
      PartyB: params.phoneNumber,
      Remarks: params.remarks,
      QueueTimeOutURL: process.env.DARAJA_B2C_TIMEOUT_URL,
      ResultURL: process.env.DARAJA_B2C_RESULT_URL,
      Occasion: params.occasion ?? "Teacher payout",
    }),
  });

  if (!res.ok) {
    throw new Error(`Daraja B2C request failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}