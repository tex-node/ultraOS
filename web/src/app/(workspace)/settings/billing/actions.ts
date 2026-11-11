"use server";

import { redirect } from "next/navigation";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { publicBaseUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { bachsBillingConfigured, createSubscriptionCheckout } from "@/lib/bachs-billing";
import { createMockCheckout, mockBachsEnabled } from "@/lib/bachs-mock";

// Start a Bachs Checkout Session for a plan (streak v18, Prompt 1; replaces the v17 Stripe action).
//
// A form action must return void, so a failure is reported by redirecting back with the reason in the query string -
// which survives a refresh, unlike a client-side toast. The plan is NOT changed here: only the webhook may change a
// plan, because only the webhook knows the payment actually succeeded.
function fail(message: string): never {
  redirect(`/settings/billing?error=${encodeURIComponent(message)}`);
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const plan = String(formData.get("plan") ?? "");
  if (plan !== "PRO" && plan !== "ENTERPRISE") fail("Pick a paid plan.");

  const { session, organizationId } = await requirePermissionWithOrganization("operations:manage");
  if (!bachsBillingConfigured()) {
    // No key: use the mock provider (streak v19, Prompt 1) so the flow is testable rather than merely described.
    if (!mockBachsEnabled()) fail("Billing not configured: BACHS_KEY is not set in this environment.");
    const token = createMockCheckout({ organizationId, plan });
    redirect(`/mock-checkout/${encodeURIComponent(token)}`);
  }

  const productId = plan === "PRO" ? process.env.BACHS_PRODUCT_PRO : process.env.BACHS_PRODUCT_ENTERPRISE;
  if (!productId) fail(`Billing not configured: ${plan === "PRO" ? "BACHS_PRODUCT_PRO" : "BACHS_PRODUCT_ENTERPRISE"} is not set.`);

  // Public origin for the redirect Bachs sends a browser to. NOT the request origin: behind Caddy that is 127.0.0.1.
    const baseUrl = publicBaseUrl();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, name: true, bachsCustomerId: true },
  });

  let url: string | null = null;
  try {
    // Visible in the service log so an operator can SEE which origin the provider will redirect to - the failure this
    // replaced was a loopback URL that only Bachs could see, in an error that named neither the URL nor the cause.
    console.info("[billing] checkout return origin", { plan, origin: baseUrl });
    const checkout = await createSubscriptionCheckout({
      organizationId: organization.id,
      plan,
      successUrl: `${baseUrl}/settings/billing?upgraded=1`,
      cancelUrl: `${baseUrl}/settings/billing?cancelled=1`,
      customerEmail: session.user.email ?? null,
      customerName: organization.name,
      existingCustomerId: organization.bachsCustomerId,
    });
    url = checkout.checkoutUrl;
  } catch (error) {
    fail(`Bachs rejected the checkout request: ${error instanceof Error ? error.message : "unknown"}`);
  }
  if (!url) fail("Bachs returned no checkout URL.");
  redirect(url);
}
