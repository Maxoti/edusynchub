const DARAJA_BASE_URL =
  process.env.DARAJA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

async function getDarajaToken(): Promise<string> {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY as string;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET as string;
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    "base64"
  );

  const res = await fetch(
    `${DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
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

interface SubscriptionStkPushParams {
  phoneNumber: string;
  amount: number;
  accountReference: string;
}

export async function initiateSubscriptionStkPush(
  params: SubscriptionStkPushParams
) {
  const token = await getDarajaToken();
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