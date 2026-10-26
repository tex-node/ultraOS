import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyStripeEvent, stripeClient, webhookConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Stripe webhook (streak v17, Prompt 2).
//
// The signature is the only credential: the route reads the RAW body (any parsing would change the bytes the signature
// covers), verifies it with STRIPE_WEBHOOK_SECRET, and only then applies the event. Without that secret the route
// refuses every request with 503 rather than trusting an unsigned payload - an unauthenticated endpoint that changes
// billing plans is a privilege-escalation hole, not a shortcut.
//
// Responses: 200 for anything we accepted (including events we do not handle, so Stripe stops retrying), 400 for a bad
// signature or malformed payload, 503 when the webhook is not configured.
export async function POST(request: Request) {
  if (!webhookConfigured()) {
    return NextResponse.json({ error: "Stripe webhooks are not configured (STRIPE_WEBHOOK_SECRET is unset)." }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });

  const rawBody = await request.text();
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error) {
    return NextResponse.json({ error: `Signature verification failed: ${error instanceof Error ? error.message : "unknown"}` }, { status: 400 });
  }

  try {
    const result = await applyStripeEvent(prisma, { id: event.id, type: event.type, data: { object: event.data.object } });
    // The only durable trace of a billing change: a webhook has no user to attribute an AuditLog row to (its userId is
    // a foreign key), so the event id - which Stripe itself exposes - is logged with what it did.
    console.info(`stripe webhook ${event.id} (${event.type}): ${JSON.stringify(result)}`);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    // A 500 makes Stripe retry, which is right for a transient database failure and wrong for a logic error - the log
    // says which happened so a retry storm has an owner.
    console.error(`stripe webhook ${event.id} (${event.type}) failed:`, error);
    return NextResponse.json({ error: "Failed to apply the event." }, { status: 500 });
  }
}
