import { webhooks } from "@bachs/sdk";
import { verifyBachsSignature } from "@/lib/bachs";

// One verifier for every Bachs webhook (streak v18, Prompt 1).
//
// The repo already had a hand-written verifier (src/lib/bachs.ts, F5.3) implementing the same scheme as the official
// SDK: HMAC-SHA256 over "<timestamp>.<raw body>", with the V2 header carrying `t=` and one or more `v1=`. Two
// implementations of a signature check is how one of them silently drifts, so this module exposes ONE entry point and
// the SDK does the work; the hand-written function is kept (and still tested) because the ticketing route uses it and a
// failing signature must not be able to take ticketing down as a side effect of a billing change.
//
// Both are exercised by scripts/bachs-webhook-verify.ts so they cannot disagree without a test failing.
export type VerifiedBachsEvent = { id: string; type: string; created_at: string; organization_id: string; data: Record<string, unknown> };

export function verifyBachsWebhook(rawBody: string, headers: Headers, secret: string): VerifiedBachsEvent {
  return webhooks.constructEvent(rawBody, headers, secret) as VerifiedBachsEvent;
}

/** The hand-written verifier, exported for the parity test and for callers that already pass individual headers. */
export { verifyBachsSignature };
