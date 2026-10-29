"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { publicBaseUrl } from "@/lib/app-url";
import { bachsBillingConfigured, createSubscriptionCheckout, productIdForPlan } from "@/lib/bachs-billing";
import type { PlanName } from "@/lib/plans";

// Admin billing on one organization (streak v18, Prompt 3).
//
// Two writes, both narrow: set the Bachs customer id by hand (a league that pays by transfer, or a customer created in
// the Bachs dashboard), and generate a checkout link ON BEHALF of the org so it can be sent to a league owner.
async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in.");
  if (!session.user.roles.includes("SUPER_ADMIN")) throw new Error("Only a platform administrator can change billing details.");
  return session;
}

export async function setBachsCustomerIdAction(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const raw = String(formData.get("bachsCustomerId") ?? "").trim();
  if (!organizationId) throw new Error("No organization supplied.");

  // Empty clears it; anything else must look like a Bachs customer id. Validating the shape here stops a typo from
  // becoming a customer id that no webhook will ever match.
  if (raw !== "" && !/^cust_[A-Za-z0-9_]{3,128}$/.test(raw)) {
    redirect(`/admin/organizations/${organizationId}?error=${encodeURIComponent("A Bachs customer id looks like cust_...")}`);
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { bachsCustomerId: raw === "" ? null : raw },
  });
  await prisma.auditLog.create({
    data: {
      organizationId,
      userId: session.user.id,
      action: "ORG_BACHS_CUSTOMER_SET",
      entityType: "Organization",
      entityId: organizationId,
      details: { bachsCustomerId: raw === "" ? null : raw },
    },
  });
  revalidatePath(`/admin/organizations/${organizationId}`);
}

export async function generateCheckoutLinkAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const organizationId = String(formData.get("organizationId") ?? "");
  const plan = String(formData.get("plan") ?? "PRO");
  if (plan !== "PRO" && plan !== "ENTERPRISE") throw new Error("Pick a paid plan.");
  if (!bachsBillingConfigured()) {
    redirect(`/admin/organizations/${organizationId}?error=${encodeURIComponent("Bachs is not configured: BACHS_KEY is missing.")}`);
  }
  if (!productIdForPlan(plan as PlanName)) {
    redirect(`/admin/organizations/${organizationId}?error=${encodeURIComponent(`BACHS_PRODUCT_${plan} is not set.`)}`);
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, name: true, bachsCustomerId: true },
  });
  // Public origin for the redirect Bachs sends a browser to (see src/lib/app-url.ts).
  const baseUrl = publicBaseUrl();
  const checkout = await createSubscriptionCheckout({
    organizationId: organization.id,
    plan: plan as PlanName,
    successUrl: `${baseUrl}/admin/organizations/${organization.id}?checkout=1`,
    cancelUrl: `${baseUrl}/admin/organizations/${organization.id}?cancelled=1`,
    customerName: organization.name,
    existingCustomerId: organization.bachsCustomerId,
  });
  redirect(checkout.checkoutUrl);
}
