import { prisma } from "../src/lib/prisma";
import { applyStripeEvent } from "../src/lib/stripe";

// Streak v17, Prompt 2 verification: a Stripe event changes an organization's plan.
//
//   npx tsx scripts/stripe-webhook-verify.ts --organization <orgId> [--restore]
//
// The route itself is exercised over HTTP by the shell script that calls this (a signed request to
// /api/webhooks/stripe); this drives the same applyStripeEvent() the route calls, so a failure is attributable to the
// logic rather than to the transport.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
if (!ORGANIZATION) {
  console.error("usage: stripe-webhook-verify.ts --organization <id>");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { plan: true, stripeCustomerId: true } });
  console.log(`before: plan=${before.plan} customer=${before.stripeCustomerId ?? "none"}`);

  // checkout.session.completed -> the purchased plan.
  const upgraded = await applyStripeEvent(prisma, {
    id: `evt_verify_${Date.now()}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_test_verify_${Date.now()}`,
        object: "checkout.session",
        customer: "cus_verify_123",
        client_reference_id: ORG,
        metadata: { organizationId: ORG, plan: "PRO" },
      },
    },
  });
  const afterUpgrade = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { plan: true, stripeCustomerId: true } });
  console.log(`checkout.session.completed -> ${JSON.stringify(upgraded)} · plan now ${afterUpgrade.plan} customer ${afterUpgrade.stripeCustomerId}`);

  // customer.subscription.deleted -> back to FREE.
  const downgraded = await applyStripeEvent(prisma, {
    id: `evt_verify_del_${Date.now()}`,
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_verify_123", object: "subscription", customer: "cus_verify_123" } },
  });
  const afterDowngrade = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { plan: true } });
  console.log(`customer.subscription.deleted -> ${JSON.stringify(downgraded)} · plan now ${afterDowngrade.plan}`);

  // An event we do not handle must be acknowledged, not applied.
  const ignored = await applyStripeEvent(prisma, { id: "evt_verify_ignored", type: "invoice.paid", data: { object: { id: "in_1" } } });
  console.log(`invoice.paid -> ${JSON.stringify(ignored)}`);

  const problems: string[] = [];
  if (afterUpgrade.plan !== "PRO") problems.push(`checkout.session.completed left the plan at ${afterUpgrade.plan}`);
  if (afterUpgrade.stripeCustomerId !== "cus_verify_123") problems.push("the Stripe customer id was not stored");
  if (afterDowngrade.plan !== "FREE") problems.push(`customer.subscription.deleted left the plan at ${afterDowngrade.plan}`);
  if (ignored.handled) problems.push("an unhandled event type was applied");

  // Restore whatever the organization had, so the verification does not leave a plan behind.
  await prisma.organization.update({ where: { id: ORG }, data: { plan: before.plan, stripeCustomerId: before.stripeCustomerId } });
  console.log(`restored: plan=${before.plan} customer=${before.stripeCustomerId ?? "none"}`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: checkout upgrades to PRO, deletion downgrades to FREE, unknown events are acknowledged but not applied" : `FAIL: ${problems.join("; ")}`);
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
