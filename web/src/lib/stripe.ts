import Stripe from "stripe";
import type { Prisma } from "@/generated/prisma/client";
import type { PlanName } from "@/lib/plans";

// Stripe integration, kept thin (streak v17, Prompt 2).
//
// The platform is NOT live on Stripe: there is no account key here, so nothing in this file may assume one. Everything
// is behind `stripeConfigured()`, which is what lets the billing page say "billing not configured" instead of showing a
// button that throws. The webhook is separate on purpose - it must work (and be testable) with no secret key, because
// Stripe signs the event and that signature is the only credential it needs.

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

let cached: Stripe | null = null;

export function stripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!cached) cached = new Stripe(process.env.STRIPE_SECRET_KEY);
  return cached;
}

/**
 * Which plan a Checkout Session bought.
 *
 * The plan is carried in the session metadata by the code that creates the session, which is authoritative: price ids
 * are configuration and can be re-pointed, metadata is written at purchase time. A price-id fallback exists for the
 * purely Stripe-side case (someone creates a payment link by hand) and maps only if the env vars are set.
 */
export function planFromSession(session: Stripe.Checkout.Session): PlanName | null {
  const fromMetadata = session.metadata?.plan;
  if (fromMetadata === "PRO" || fromMetadata === "ENTERPRISE" || fromMetadata === "FREE") return fromMetadata;
  const priceId = typeof session.line_items?.data?.[0]?.price?.id === "string" ? session.line_items.data[0].price.id : null;
  if (priceId && process.env.STRIPE_PRICE_PRO && priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  if (priceId && process.env.STRIPE_PRICE_ENTERPRISE && priceId === process.env.STRIPE_PRICE_ENTERPRISE) return "ENTERPRISE";
  return null;
}

export function organizationIdFromSession(session: Stripe.Checkout.Session): string | null {
  const fromMetadata = session.metadata?.organizationId;
  if (fromMetadata) return fromMetadata;
  const clientReference = session.client_reference_id;
  return clientReference ?? null;
}

/** Apply a verified Stripe event to an organization. Exported so a test can drive it without a server. */
export async function applyStripeEvent(
  prisma: Prisma.TransactionClient,
  event: { id: string; type: string; data: { object: unknown } },
): Promise<{ handled: boolean; organizationId?: string; plan?: PlanName; reason?: string }> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const organizationId = organizationIdFromSession(session);
    const plan = planFromSession(session);
    if (!organizationId) return { handled: false, reason: "the session carries no organizationId" };
    if (!plan) return { handled: false, reason: "the session carries no recognisable plan" };
    const updated = await prisma.organization.updateMany({
      where: { id: organizationId },
      data: { plan, ...(typeof session.customer === "string" ? { stripeCustomerId: session.customer } : {}) },
    });
    if (updated.count === 0) return { handled: false, reason: `no organization ${organizationId}` };
    // Deliberately NOT an AuditLog row: AuditLog.userId is a foreign key to User, and a webhook has no user. Writing
    // a synthetic id would violate the FK, and attributing a billing change to a real person who did not make it would
    // be worse than leaving it out. The route logs the event id, which is the traceable handle Stripe itself offers.
    return { handled: true, organizationId, plan };
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
    if (!customerId) return { handled: false, reason: "the subscription carries no customer id" };
    // The subscription is gone, so the organization goes back to FREE - the same state a new signup starts in.
    const updated = await prisma.organization.updateMany({ where: { stripeCustomerId: customerId }, data: { plan: "FREE" } });
    if (updated.count === 0) return { handled: false, reason: `no organization for customer ${customerId}` };
    return { handled: true, plan: "FREE" };
  }

  // Anything else is acknowledged and ignored: Stripe sends many event types and a 400 would make it retry forever.
  return { handled: false, reason: `unhandled event type ${event.type}` };
}
