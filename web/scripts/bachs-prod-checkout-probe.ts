// Production checkout reachability: can the live key create a session for a real production org?
//
// This does NOT charge anything - it asks Bachs for a hosted checkout URL, which is exactly what the Upgrade button does
// before the customer sees a card form. Prints the URL's HOST and the checkout id prefix, never the token.
import { prisma } from "../src/lib/prisma";
import { createSubscriptionCheckout } from "../src/lib/bachs-billing";

async function main() {
  const organization = await prisma.organization.findFirst({
    where: { slug: "neon-ultra" },
    select: { id: true, slug: true, plan: true },
  });
  if (!organization) {
    console.log("  no neon-ultra org on this database");
    return;
  }
  console.log(`  organization: ${organization.slug} (plan ${organization.plan})`);

  for (const plan of ["PRO", "ENTERPRISE"] as const) {
    try {
      const session = await createSubscriptionCheckout({
        organizationId: organization.id,
        plan,
        successUrl: "https://app.neonultra.ng/settings/billing?checkout=success",
        cancelUrl: "https://app.neonultra.ng/settings/billing?checkout=cancelled",
        // The real action passes the signed-in user's email and the organization's name; without both, Bachs rejects a
        // subscription checkout ("customer is required ... a guest record is not"). This probe must do the same or it tests
        // nothing the button does.
        customerEmail: "texdevices@gmail.com",
        customerName: organization.slug,
      });
      const host = new URL(session.checkoutUrl).host;
      console.log(`  ${plan}: session created · host=${host} · id=${session.checkoutId.slice(0, 8)}…`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ${plan}: FAILED · ${message.slice(0, 180)}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
