import { Bachs } from "@bachs/sdk";
import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { systemActorId } from "@/lib/system-actor";
import { bachsConfig } from "@/lib/bachs";
import type { PlanName } from "@/lib/plans";

// Subscription billing through Bachs (streak v18, Prompt 1).
//
// This is deliberately a SEPARATE module from src/lib/bachs.ts, which already serves ticketing: that one is
// amount-based (`pricing`) and hand-rolled over fetch, because event tickets are a one-off amount in kobo. A PLAN is a
// product, and Bachs expresses products through `product_cart`, which the official SDK models with types. Putting the
// two in one file would mean one function with two shapes; keeping them apart means the ticket flow keeps working
// untouched while billing gets the typed client.
//
// What the SDK actually accepts (checked against @bachs/sdk 2.0.0, not assumed):
//   checkoutSessions.create({ product_cart: [{ product_id, quantity }], billing_currency, metadata, success_url, ... })
// There is no `settlement` argument and no `billing: "subscription"` - the settlement currency is `billing_currency`
// and "subscription" is a property of the PRODUCT configured in the Bachs dashboard.

export function bachsBillingConfigured(): boolean {
  const config = bachsConfig();
  return Boolean(config?.apiKey);
}

export function productIdForPlan(plan: PlanName): string | null {
  if (plan === "PRO") return process.env.BACHS_PRODUCT_PRO ?? null;
  if (plan === "ENTERPRISE") return process.env.BACHS_PRODUCT_ENTERPRISE ?? null;
  return null;
}

export function planForProductId(productId: string | null | undefined): PlanName | null {
  if (!productId) return null;
  if (process.env.BACHS_PRODUCT_PRO && productId === process.env.BACHS_PRODUCT_PRO) return "PRO";
  if (process.env.BACHS_PRODUCT_ENTERPRISE && productId === process.env.BACHS_PRODUCT_ENTERPRISE) return "ENTERPRISE";
  return null;
}

let cachedClient: Bachs | null = null;

export function bachsSdk(): Bachs {
  const config = bachsConfig();
  if (!config) throw new Error("Bachs is not configured: set BACHS_KEY (or BACH_IO).");
  if (!cachedClient) {
    cachedClient = new Bachs({ apiKey: config.apiKey, ...(process.env.BACHS_API_BASE ? { baseURL: process.env.BACHS_API_BASE } : {}) });
  }
  return cachedClient;
}

export type SubscriptionCheckout = { checkoutId: string; checkoutUrl: string };

/**
 * Create a hosted Checkout Session for a plan.
 *
 * The organization id travels in `metadata.organizationId` and in `reference`, because those are the two places the
 * webhook can find it - and the webhook is the only thing allowed to change a plan.
 */
export async function createSubscriptionCheckout(args: {
  organizationId: string;
  plan: PlanName;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  customerName?: string | null;
  existingCustomerId?: string | null;
}): Promise<SubscriptionCheckout> {
  const productId = productIdForPlan(args.plan);
  if (!productId) {
    throw new Error(`No Bachs product configured for ${args.plan}: set BACHS_PRODUCT_${args.plan}.`);
  }
  const session = await bachsSdk().checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    // Settlement in naira: this is a Nigerian platform charging Nigerian leagues, and Bachs settles locally.
    billing_currency: process.env.BACHS_SETTLEMENT_CURRENCY ?? "NGN",
    // Bachs identifies a known customer by `customer_id`, and otherwise needs BOTH an email and a name - a partial
    // customer object is rejected, so an email alone is left out entirely and the hosted page collects the rest.
    customer: args.existingCustomerId
      ? { customer_id: args.existingCustomerId }
      : args.customerEmail && args.customerName
        ? { email: args.customerEmail, name: args.customerName }
        : null,
    customer_creation: args.existingCustomerId ? undefined : "if_required",
    reference: `org:${args.organizationId}:${args.plan}`.slice(0, 128),
    metadata: { organizationId: args.organizationId, plan: args.plan },
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  return { checkoutId: session.checkout_id, checkoutUrl: session.checkout_url };
}

export type BachsBillingEvent = {
  id: string;
  type: string;
  created_at: string;
  organization_id: string;
  data: Record<string, unknown>;
};

const PLAN_VALUES: PlanName[] = ["FREE", "PRO", "ENTERPRISE"];
const asPlan = (value: unknown): PlanName | null =>
  typeof value === "string" && (PLAN_VALUES as string[]).includes(value) ? (value as PlanName) : null;

/**
 * Apply a VERIFIED billing event to an organization.
 *
 * `checkout.completed` sets the plan that was bought; `subscription.cancelled` returns the organization to FREE. The
 * organization comes from the metadata written at checkout time, or from the stored bachsCustomerId for a cancellation
 * that only carries the customer. Every change is audited against the SYSTEM actor - the gap v17 left open because
 * AuditLog.userId is a foreign key and a webhook has no user.
 */
export async function applyBachsBillingEvent(
  prisma: Prisma.TransactionClient,
  event: BachsBillingEvent,
): Promise<{ handled: boolean; organizationId?: string; plan?: PlanName; reason?: string }> {
  const data = event.data ?? {};

  if (event.type === "checkout.completed") {
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    let organizationId = typeof metadata.organizationId === "string" ? metadata.organizationId : null;
    // Fall back to the reference we wrote ("org:<id>:<plan>") when a provider trims metadata.
    if (!organizationId && typeof data.reference === "string" && data.reference.startsWith("org:")) {
      organizationId = data.reference.split(":")[1] ?? null;
    }
    const cart = (data.cart ?? data.product_cart ?? []) as { product_id?: string }[];
    const plan = asPlan(metadata.plan) ?? planForProductId(cart[0]?.product_id) ?? "PRO";
    if (!organizationId) return { handled: false, reason: "the event carries no organizationId" };

    const customerId = typeof data.customer_id === "string" ? data.customer_id : undefined;
    const updated = await prisma.organization.updateMany({
      where: { id: organizationId },
      data: { plan, ...(customerId ? { bachsCustomerId: customerId } : {}) },
    });
    if (updated.count === 0) return { handled: false, reason: `no organization ${organizationId}` };
    await auditPlanChange(prisma, organizationId, plan, event);
    return { handled: true, organizationId, plan };
  }

  if (event.type === "subscription.cancelled") {
    const customerId = typeof data.customer_id === "string" ? data.customer_id : null;
    if (!customerId) return { handled: false, reason: "the event carries no customer_id" };
    const organization = await prisma.organization.findFirst({ where: { bachsCustomerId: customerId }, select: { id: true } });
    if (!organization) return { handled: false, reason: `no organization for customer ${customerId}` };
    await prisma.organization.update({ where: { id: organization.id }, data: { plan: "FREE" } });
    await auditPlanChange(prisma, organization.id, "FREE", event);
    return { handled: true, organizationId: organization.id, plan: "FREE" };
  }

  return { handled: false, reason: `not a billing event (${event.type})` };
}

async function auditPlanChange(tx: Prisma.TransactionClient, organizationId: string, plan: PlanName, event: BachsBillingEvent) {
  await writeAuditLog(tx, {
    organizationId,
    userId: systemActorId(),
    action: plan === "FREE" ? "ORG_DOWNGRADED_BY_BACHS" : "ORG_UPGRADED_BY_BACHS",
    entityType: "Organization",
    entityId: organizationId,
    details: { plan, bachsEventId: event.id, bachsEventType: event.type, bachsOrganizationId: event.organization_id },
  });
}
