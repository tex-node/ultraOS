// Prove the checkout return URLs are the PUBLIC origin, using the same helper the billing action uses.
//
// The bug this guards against (v32c): the action built them from `APP_BASE_URL ?? NEXTAUTH_URL ?? "http://127.0.0.1:4120"`,
// and production sets neither of the first two - so Bachs received loopback URLs and refused the checkout at the card form.
import { prisma } from "../src/lib/prisma";
import { publicBaseUrl } from "../src/lib/app-url";
import { createSubscriptionCheckout } from "../src/lib/bachs-billing";

async function main() {
  const base = publicBaseUrl();
  console.log(`  publicBaseUrl() -> ${base}`);
  console.log(`  success_url would be ${base}/settings/billing?upgraded=1`);
  console.log(`  cancel_url  would be ${base}/settings/billing?cancelled=1`);

  const organization = await prisma.organization.findFirst({
    where: { slug: "neon-ultra" },
    select: { id: true, slug: true },
  });
  if (!organization) {
    console.log("  no neon-ultra organization here");
    return;
  }

  try {
    const session = await createSubscriptionCheckout({
      organizationId: organization.id,
      plan: "PRO",
      successUrl: `${base}/settings/billing?upgraded=1`,
      cancelUrl: `${base}/settings/billing?cancelled=1`,
      customerEmail: "texdevices@gmail.com",
      customerName: organization.slug,
    });
    console.log(`  session created · host=${new URL(session.checkoutUrl).host} · id=${session.checkoutId.slice(0, 8)}…`);
  } catch (error) {
    console.log(`  session FAILED · ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
