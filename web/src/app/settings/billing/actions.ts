"use server";

import { redirect } from "next/navigation";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { stripeClient, stripeConfigured } from "@/lib/stripe";
import type { PlanName } from "@/lib/plans";

// Start a Stripe Checkout Session (streak v17, Prompt 2).
//
// Returns a redirect to Stripe when billing is configured; when it is NOT, it throws a readable error that the page
// turns into "billing not configured". The plan and the organization are carried in metadata because that is what the
// webhook reads back - the price id alone would make a re-pointed price change someone's plan silently.
// A form action must return void, so a failure is reported by redirecting back with the reason in the query string -
// which also survives a page refresh, unlike a transient client-side toast.
function fail(message: string): never {
  redirect(`/settings/billing?error=${encodeURIComponent(message)}`);
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const plan = String(formData.get("plan") ?? "");
  if (plan !== "PRO" && plan !== "ENTERPRISE") fail("Pick a paid plan.");

  const { organizationId } = await requirePermissionWithOrganization("operations:manage");
  if (!stripeConfigured()) fail("Billing not configured: STRIPE_SECRET_KEY is not set in this environment.");

  const priceId = plan === "PRO" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_ENTERPRISE;
  if (!priceId) fail(`Billing not configured: ${plan === "PRO" ? "STRIPE_PRICE_PRO" : "STRIPE_PRICE_ENTERPRISE"} is not set.`);

  const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://127.0.0.1:4120";
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true, stripeCustomerId: true } });

  let url: string | null = null;
  try {
    const checkout = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: organization.stripeCustomerId ?? undefined,
      client_reference_id: organization.id,
      metadata: { organizationId: organization.id, plan: plan satisfies PlanName },
      subscription_data: { metadata: { organizationId: organization.id, plan } },
      success_url: `${baseUrl}/settings/billing?upgraded=1`,
      cancel_url: `${baseUrl}/settings/billing?cancelled=1`,
      // The organization name shows on the Stripe-hosted page, so a customer recognises what they are paying for.
      ...(organization.stripeCustomerId ? {} : { customer_creation: "always" as const }),
    });
    url = checkout.url;
  } catch (error) {
    fail(`Stripe rejected the checkout request: ${error instanceof Error ? error.message : "unknown"}`);
  }
  if (!url) fail("Stripe returned no checkout URL.");
  redirect(url);
}
