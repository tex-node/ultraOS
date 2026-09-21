import crypto from "node:crypto";

// Bachs payment gateway client (F5.3). Server-side only — the secret key must never reach
// the browser. Money is handled as kobo in the app and converted to the gateway's decimal
// string at currency precision ("29.00") with an ISO 4217 currency field.

export type BachsConfig = {
  apiBase: string;
  apiKey: string;
  webhookSecret: string;
};

export function bachsConfig(): BachsConfig | null {
  const apiKey = process.env.BACH_IO;
  if (!apiKey) return null;
  return {
    apiBase: (process.env.BACH_API_BASE ?? "https://api.bachs.io").replace(/\/$/, ""),
    apiKey,
    webhookSecret: process.env.BACH_WEBHOOK ?? "",
  };
}

// kobo -> "1234.56" (NGN has 2 decimal places, matching our 100-kobo = 1 naira pricing).
export function koboToAmountString(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

export type CheckoutSession = {
  checkout_id: string;
  checkout_url: string;
  status: string;
};

export type CreateCheckoutInput = {
  amountKobo: number;
  currency?: string;
  reference: string;
  metadata?: Record<string, string>;
  customerEmail?: string | null;
  customerName?: string | null;
  phoneNumber?: string | null;
  successUrl: string;
  cancelUrl: string;
  expiresInMinutes?: number;
};

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CheckoutSession> {
  const config = bachsConfig();
  if (!config) throw new Error("BACHS_NOT_CONFIGURED");

  const response = await fetch(`${config.apiBase}/v1/checkout-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pricing: { currency: input.currency ?? "NGN", amount: koboToAmountString(input.amountKobo) },
      ...(input.customerEmail || input.customerName || input.phoneNumber
        ? {
            customer: {
              ...(input.customerEmail ? { email: input.customerEmail } : {}),
              ...(input.customerName ? { name: input.customerName } : {}),
              ...(input.phoneNumber ? { phone_number: input.phoneNumber } : {}),
            },
          }
        : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      reference: input.reference.slice(0, 128),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.expiresInMinutes ? { expires_in_minutes: input.expiresInMinutes } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BACHS_CHECKOUT_FAILED:${response.status}:${body.slice(0, 300)}`);
  }
  return (await response.json()) as CheckoutSession;
}

// Webhook verification (docs: "Verifying your webhooks"). Signature is HMAC-SHA256 of
// `"{timestamp}.{raw_body}"`; V2 header carries `t=..,v1=..` and may repeat v1 during a
// secret rotation. Always hash the raw body — never a re-serialized JSON.
export function verifyBachsSignature(input: {
  rawBody: string;
  secret: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  signatureV2Header: string | null;
  toleranceSeconds?: number;
}): boolean {
  const tolerance = input.toleranceSeconds ?? 300;

  if (input.signatureV2Header) {
    const parts = new Map(
      input.signatureV2Header
        .split(",")
        .map((p) => p.split("=", 2))
        .filter((p) => p.length === 2)
        .map(([k, v]) => [k, v] as const),
    );
    const timestamp = Number(parts.get("t"));
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > tolerance) {
      return false;
    }
    const expected = hmacHex(input.secret, `${timestamp}.${input.rawBody}`);
    const signatures = [...input.signatureV2Header.split(",")]
      .map((p) => p.split("=", 2))
      .filter((p) => p[0] === "v1")
      .map((p) => p[1]);
    return signatures.some((sig) => timingSafeEqual(expected, sig));
  }

  if (!input.timestampHeader || !input.signatureHeader) return false;
  const timestamp = Number(input.timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > tolerance) {
    return false;
  }
  const expected = hmacHex(input.secret, `${timestamp}.${input.rawBody}`);
  return timingSafeEqual(expected, input.signatureHeader);
}

function hmacHex(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Connect sub-accounts (F5.3): a financial identity per vendor so payouts reconcile.
export type ConnectedAccount = { account_id: string; status: string };

export async function createConnectedAccount(input: {
  name: string;
  email: string;
  metadata?: Record<string, string>;
}): Promise<ConnectedAccount> {
  const config = bachsConfig();
  if (!config) throw new Error("BACHS_NOT_CONFIGURED");
  const response = await fetch(`${config.apiBase}/v1/accounts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "connected",
      company: { name: input.name },
      contact: { email: input.email },
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BACHS_ACCOUNT_FAILED:${response.status}:${body.slice(0, 300)}`);
  }
  return (await response.json()) as ConnectedAccount;
}

export async function createAccountLink(accountId: string): Promise<{ url: string }> {
  const config = bachsConfig();
  if (!config) throw new Error("BACHS_NOT_CONFIGURED");
  const response = await fetch(`${config.apiBase}/v1/accounts/${accountId}/account-links`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "account_onboarding", refresh_url: "", return_url: "" }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BACHS_ACCOUNT_LINK_FAILED:${response.status}:${body.slice(0, 300)}`);
  }
  return (await response.json()) as { url: string };
}

// Connect transfer (docs: "Transfers"): moves a vendor's net share from the platform balance
// to its own connected account. `transfer_group` tags the whole order's shares so they can be
// traced from the order back to its transfers.
export type TransferResult = { transfer_id: string; status: string };

export async function createTransfer(input: {
  amountKobo: number;
  currency?: string;
  destinationAccountId: string;
  reference: string;
  transferGroup: string;
}): Promise<TransferResult> {
  const config = bachsConfig();
  if (!config) throw new Error("BACHS_NOT_CONFIGURED");
  const response = await fetch(`${config.apiBase}/v1/transfers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: koboToAmountString(input.amountKobo),
      currency: input.currency ?? "NGN",
      destination: input.destinationAccountId,
      reference: input.reference.slice(0, 128),
      transfer_group: input.transferGroup.slice(0, 128),
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BACHS_TRANSFER_FAILED:${response.status}:${body.slice(0, 300)}`);
  }
  return (await response.json()) as TransferResult;
}