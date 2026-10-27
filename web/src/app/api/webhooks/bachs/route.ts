import { NextResponse } from "next/server";
import { bachsConfig } from "@/lib/bachs";
import { applyBachsBillingEvent, type BachsBillingEvent } from "@/lib/bachs-billing";
import { verifyBachsWebhook } from "@/lib/bachs-webhook";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bachs webhook - the canonical path (streak v18, Prompt 1: replaces /api/webhooks/stripe).
//
// The ticketing webhook at /api/bachs/webhook predates this and still handles collection.succeeded / refund.paid; this
// route is the same provider, same secret, but scoped to BILLING events. Rather than merge the two handlers (and risk
// one provider's delivery being handled twice), this route ignores anything that is not a billing event and says so in
// its response - the two endpoints are distinguishable at the provider by their URL.
//
// Rules, unchanged from the Stripe implementation because they were right:
//   * the RAW body is verified before parsing - JSON.parse then re-stringify would change the bytes the HMAC covers;
//   * the signature is the only credential, so an unconfigured secret is a 503, never a trust-the-payload;
//   * a bad signature is 400 (not 401: there is no authentication scheme here, just an integrity check);
//   * unhandled event types are acknowledged with 200 so the provider stops retrying.
export async function POST(request: Request) {
  const config = bachsConfig();
  if (!config || !config.webhookSecret) {
    return NextResponse.json(
      { error: "Bachs webhooks are not configured (BACHS_WEBHOOK_SECRET is unset)." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  let event: BachsBillingEvent;
  try {
    event = verifyBachsWebhook(rawBody, request.headers, config.webhookSecret) as BachsBillingEvent;
  } catch (error) {
    return NextResponse.json(
      { error: `Signature verification failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 400 },
    );
  }

  try {
    const result = await applyBachsBillingEvent(prisma, event);
    // The durable trace is the AuditLog row the handler writes for a handled event; this line covers the rest (an
    // unhandled type, or a payload that named an organization that does not exist).
    if (!result.handled) console.info(`bachs webhook ${event.id} (${event.type}) not applied: ${result.reason}`);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error(`bachs webhook ${event.id} (${event.type}) failed:`, error);
    return NextResponse.json({ error: "Failed to apply the event." }, { status: 500 });
  }
}
