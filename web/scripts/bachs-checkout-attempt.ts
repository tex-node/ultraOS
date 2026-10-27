import { prisma } from "../src/lib/prisma";
import { createSubscriptionCheckout } from "../src/lib/bachs-billing";

// What does a real checkout attempt do on staging now? (streak v24, Prompt 1)
// The sandbox key is installed; the product ids are not. This records the EXACT failure rather than guessing at it.
async function main() {
  const organization = await prisma.organization.findFirst({ where: { slug: "test-league-b" }, select: { id: true, slug: true, plan: true } });
  if (!organization) {
    console.log("  no staging organization to test with");
    return;
  }
  console.log(`  organization: ${organization.slug} (plan ${organization.plan})`);
  const admin = await prisma.user.findFirst({ where: { roles: { some: { role: "LEAGUE_OPERATOR", revokedAt: null, organizationId: organization.id } } }, select: { id: true, email: true } });
  try {
    const session = await createSubscriptionCheckout({
      organizationId: organization.id,
      plan: "PRO",
      successUrl: "http://127.0.0.1:4120/settings/billing?checkout=success",
      cancelUrl: "http://127.0.0.1:4120/settings/billing?checkout=cancelled",
      customerEmail: admin?.email ?? undefined,
    });
    console.log(`  checkout created: ${session.checkoutId}`);
    // The URL is what a browser would be redirected to; its host proves which environment the SDK chose (sandbox vs live).
    console.log(`  url host: ${new URL(session.checkoutUrl).host}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  checkout FAILED: ${message.slice(0, 300)}`);
  }
  await prisma.$disconnect();
}
main();
