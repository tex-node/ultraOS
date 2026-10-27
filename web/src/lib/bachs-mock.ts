import crypto from "node:crypto";
import { bachsConfig } from "@/lib/bachs";

// A MOCK Bachs provider (streak v19, Prompt 1).
//
// The real checkout has never run: there is no BACHS_KEY in any environment, so the whole billing flow - checkout, the
// hosted page, the webhook - was unexercised code behind a "not configured" message. This makes it testable end to end
// WITHOUT pretending to be production:
//
//   * the checkout is a SIGNED TOKEN in the URL, not a database row. Nothing to clean up, nothing to forge without the
//     secret, and a token that outlives its purpose is simply rejected by its own expiry check.
//   * "Simulate Payment" posts a REAL signed webhook to /api/webhooks/bachs, so the code path under test is the same one
//     a live Bachs delivery takes - not a shortcut that calls applyBachsBillingEvent() directly.
//   * it is only enabled when there is no real key, and the billing page says TEST MODE in as many words.
const TOKEN_TTL_MS = 30 * 60 * 1000;

export type MockCheckout = {
  organizationId: string;
  plan: "PRO" | "ENTERPRISE";
  createdAt: number;
};

export function mockBachsEnabled(): boolean {
  // Two ways in, and no others:
  //   * no key at all - the original case, where the real flow cannot run;
  //   * BACHS_MOCK=1 - a deliberate opt-in, because BOTH environments actually hold a LIVE key (under the legacy
  //     BACH_IO name) and a test environment therefore cannot be inferred from "the key is missing".
  // A live key is NEVER silently overridden: without BACHS_MOCK=1, the real checkout is used even if it will fail.
  if (process.env.BACHS_MOCK === "1") return true;
  return !bachsConfig()?.apiKey;
}

/** The webhook secret the simulation will sign with (the same one the route verifies with). */
export function mockSigningSecret(): string | null {
  const secret = bachsConfig()?.webhookSecret;
  return secret && secret.length > 0 ? secret : null;
}

function tokenSecret(): string {
  // A dedicated secret when present, else derived from the webhook secret. Never the user's session secret: a mock
  // checkout token must not be forgeable from anything a visitor can see.
  return process.env.BACHS_MOCK_SECRET ?? mockSigningSecret() ?? "bachs-mock-development-secret";
}

export function createMockCheckout(input: { organizationId: string; plan: "PRO" | "ENTERPRISE" }): string {
  const payload: MockCheckout = { organizationId: input.organizationId, plan: input.plan, createdAt: Date.now() };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = crypto.createHmac("sha256", tokenSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyMockCheckoutToken(token: string): { ok: true; checkout: MockCheckout } | { ok: false; reason: string } {
  const [body, mac] = token.split(".");
  if (!body || !mac) return { ok: false, reason: "malformed token" };
  const expected = crypto.createHmac("sha256", tokenSecret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "signature does not match" };
  let parsed: MockCheckout;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "payload is not JSON" };
  }
  if (typeof parsed.organizationId !== "string" || (parsed.plan !== "PRO" && parsed.plan !== "ENTERPRISE")) {
    return { ok: false, reason: "payload is not a checkout" };
  }
  if (Date.now() - parsed.createdAt > TOKEN_TTL_MS) return { ok: false, reason: "token expired" };
  return { ok: true, checkout: parsed };
}

/** The event body a successful payment produces, in the shape the real webhook expects. */
export function mockCheckoutEventBody(checkout: MockCheckout, eventId: string): string {
  return JSON.stringify({
    id: eventId,
    type: "checkout.completed",
    created_at: new Date().toISOString(),
    organization_id: "org_mock_bachs",
    data: {
      checkout_id: `chk_mock_${eventId.slice(-8)}`,
      customer_id: `cust_mock_${checkout.organizationId.slice(-6)}`,
      reference: `org:${checkout.organizationId}:${checkout.plan}`,
      metadata: { organizationId: checkout.organizationId, plan: checkout.plan, mock: "true" },
      cart: [{ product_id: `prod_mock_${checkout.plan.toLowerCase()}` }],
    },
  });
}

/** Sign a body exactly as Bachs does: `t=<unix>,v1=hmac_sha256(secret, "<t>.<body>")`. */
export function signBachsBody(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): { header: string; timestamp: number } {
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(body, "utf8").digest("hex");
  return { header: `t=${timestamp},v1=${signature}`, timestamp };
}
