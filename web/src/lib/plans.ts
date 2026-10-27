import type { Prisma } from "@/generated/prisma/client";

// Plan limits (streak v16, Prompt 3).
//
// One table, one place to change a number, and every enforcement point reads it - the API keys, the feed subscriptions
// and competition creation all call `assertWithinPlan`, so a limit cannot be enforced in one path and forgotten in
// another.
//
// `null` means unlimited. The numbers are the brief's:
//   FREE       no API keys, 1 competition, no webhooks
//   PRO        API keys, unlimited competitions, 5 webhooks
//   ENTERPRISE everything unlimited
export type PlanName = "FREE" | "PRO" | "ENTERPRISE";

export const PLAN_LIMITS: Record<PlanName, { apiKeys: number | null; competitions: number | null; webhooks: number | null }> = {
  FREE: { apiKeys: 0, competitions: 1, webhooks: 0 },
  PRO: { apiKeys: 5, competitions: null, webhooks: 5 },
  ENTERPRISE: { apiKeys: null, competitions: null, webhooks: null },
};

export type PlanResource = "apiKeys" | "competitions" | "webhooks";

export class PlanLimitError extends Error {
  constructor(
    readonly resource: PlanResource,
    readonly limit: number,
    readonly plan: PlanName,
  ) {
    super(
      `The ${plan} plan allows ${limit} ${RESOURCE_LABEL[resource]}${limit === 1 ? "" : ""}. Upgrade to add more.`,
    );
    this.name = "PlanLimitError";
  }
}

const RESOURCE_LABEL: Record<PlanResource, string> = {
  apiKeys: "API key(s)",
  competitions: "competition(s)",
  webhooks: "webhook subscription(s)",
};

async function currentPlan(tx: Prisma.TransactionClient, organizationId: string): Promise<PlanName> {
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { plan: true } });
  if (!organization) throw new Error(`No organization ${organizationId}.`);
  return organization.plan as PlanName;
}

async function currentCount(tx: Prisma.TransactionClient, organizationId: string, resource: PlanResource): Promise<number> {
  if (resource === "apiKeys") return tx.apiKey.count({ where: { organizationId, revokedAt: null } });
  if (resource === "competitions") return tx.competition.count({ where: { organizationId } });
  return tx.dataFeedSubscription.count({ where: { organizationId, isActive: true } });
}

/** Throw a PlanLimitError if one more of `resource` would exceed the organization's plan. */
export async function assertWithinPlan(
  tx: Prisma.TransactionClient,
  organizationId: string,
  resource: PlanResource,
): Promise<void> {
  const plan = await currentPlan(tx, organizationId);
  const limit = PLAN_LIMITS[plan][resource];
  if (limit === null) return;
  const used = await currentCount(tx, organizationId, resource);
  if (used >= limit) throw new PlanLimitError(resource, limit, plan);
}

export type PlanUsage = {
  plan: PlanName;
  bachsCustomerId: string | null;
  usage: Record<PlanResource, { used: number; limit: number | null }>;
};

/** Everything the billing page shows, in one read. */
export async function loadPlanUsage(tx: Prisma.TransactionClient, organizationId: string): Promise<PlanUsage> {
  const organization = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true, bachsCustomerId: true },
  });
  const plan = organization.plan as PlanName;
  const [apiKeys, competitions, webhooks] = await Promise.all([
    currentCount(tx, organizationId, "apiKeys"),
    currentCount(tx, organizationId, "competitions"),
    currentCount(tx, organizationId, "webhooks"),
  ]);
  return {
    plan,
    bachsCustomerId: organization.bachsCustomerId,
    usage: {
      apiKeys: { used: apiKeys, limit: PLAN_LIMITS[plan].apiKeys },
      competitions: { used: competitions, limit: PLAN_LIMITS[plan].competitions },
      webhooks: { used: webhooks, limit: PLAN_LIMITS[plan].webhooks },
    },
  };
}
