import { prisma } from "../src/lib/prisma";
import { applyBachsBillingEvent } from "../src/lib/bachs-billing";

// Streak v18, Prompt 1 verification: a Bachs billing event changes an organization's plan, audited by SYSTEM.
//
//   npx tsx scripts/bachs-billing-verify.ts --organization <orgId>
//
// The HTTP path (signature verification) is exercised by the shell script that calls this, which POSTs a correctly
// signed payload to /api/webhooks/bachs. This drives the same applyBachsBillingEvent() the route calls, so a failure is
// attributable to the logic rather than the transport.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
if (!ORGANIZATION) {
  console.error("usage: bachs-billing-verify.ts --organization <id>");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { name: true, plan: true, bachsCustomerId: true } });
  console.log(`organization: ${before.name} · plan ${before.plan} · customer ${before.bachsCustomerId ?? "none"}`);

  const upgraded = await applyBachsBillingEvent(prisma, {
    id: `evt_bachs_verify_${Date.now()}`,
    type: "checkout.completed",
    created_at: new Date().toISOString(),
    organization_id: "org_bachs_verify",
    data: {
      checkout_id: "chk_verify_1",
      customer_id: "cust_verify_v18",
      reference: `org:${ORG}:PRO`,
      metadata: { organizationId: ORG, plan: "PRO" },
      cart: [{ product_id: "prod_verify" }],
    },
  });
  const afterUpgrade = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { plan: true, bachsCustomerId: true } });
  console.log(`checkout.completed -> ${JSON.stringify(upgraded)} · plan ${afterUpgrade.plan} · customer ${afterUpgrade.bachsCustomerId}`);

  const cancelled = await applyBachsBillingEvent(prisma, {
    id: `evt_bachs_verify_cancel_${Date.now()}`,
    type: "subscription.cancelled",
    created_at: new Date().toISOString(),
    organization_id: "org_bachs_verify",
    data: { customer_id: "cust_verify_v18", subscription_id: "sub_verify" },
  });
  const afterCancel = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { plan: true } });
  console.log(`subscription.cancelled -> ${JSON.stringify(cancelled)} · plan ${afterCancel.plan}`);

  const ignored = await applyBachsBillingEvent(prisma, {
    id: "evt_bachs_verify_ignored",
    type: "collection.succeeded",
    created_at: new Date().toISOString(),
    organization_id: "org_bachs_verify",
    data: {},
  });
  console.log(`collection.succeeded -> ${JSON.stringify(ignored)}`);

  // The audit trail is the point of Prompt 2: a webhook-driven change must leave a row attributable to SYSTEM.
  const audits = await prisma.auditLog.findMany({
    where: { organizationId: ORG, action: { in: ["ORG_UPGRADED_BY_BACHS", "ORG_DOWNGRADED_BY_BACHS"] } },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { action: true, userId: true, details: true },
  });
  console.log(`audit rows: ${audits.map((row) => `${row.action}(by ${row.userId})`).join(" · ") || "NONE"}`);

  const problems: string[] = [];
  if (afterUpgrade.plan !== "PRO") problems.push(`checkout.completed left the plan at ${afterUpgrade.plan}`);
  if (afterUpgrade.bachsCustomerId !== "cust_verify_v18") problems.push("the Bachs customer id was not stored");
  if (afterCancel.plan !== "FREE") problems.push(`subscription.cancelled left the plan at ${afterCancel.plan}`);
  if (ignored.handled) problems.push("a non-billing event was applied");
  if (audits.length < 2) problems.push(`expected 2 audit rows, found ${audits.length}`);
  if (audits.some((row) => row.userId !== "system00000000000000000")) problems.push("an audit row is not attributed to the SYSTEM actor");

  await prisma.organization.update({ where: { id: ORG }, data: { plan: before.plan, bachsCustomerId: before.bachsCustomerId } });
  console.log(`restored: plan=${before.plan} customer=${before.bachsCustomerId ?? "none"}`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: checkout upgrades, cancellation downgrades, non-billing events ignored, both audited by SYSTEM" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
