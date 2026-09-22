"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ProductApproval, ProductCategory } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { createAccountLink, createConnectedAccount } from "@/lib/bachs";
import { formDataToRecord } from "@/lib/club-validation";
import { nairaToKobo } from "@/lib/money";
import { withOrganizationContext } from "@/lib/tenant-context";

const vendorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  contactName: z.string().trim().max(100),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(30),
});

export async function createVendor(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  const input = vendorSchema.parse(formDataToRecord(formData));
  const vendor = await withOrganizationContext(organizationId, async (tx) => {
    const created = await tx.vendor.create({
      data: {
        organizationId,
        name: input.name,
        contactName: input.contactName || null,
        email: input.email || null,
        phone: input.phone || null,
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "VENDOR_CREATED",
      entityType: "Vendor",
      entityId: created.id,
      details: { name: created.name },
    });
    return created;
  });
  revalidatePath("/vendors");
  redirect(`/vendors/${vendor.id}`);
}

const productSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500),
  category: z.enum(ProductCategory),
  priceNaira: z.string().min(1),
  imageUrl: z.string().trim().url().or(z.literal("")),
  fanClubDiscountPercent: z.coerce.number().min(0).max(100),
});

export async function createVendorProduct(
  vendorId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  const input = productSchema.parse(formDataToRecord(formData));
  await withOrganizationContext(organizationId, async (tx) => {
    // vendorId arrives as a route param, not a scoped lookup result - a foreign-org vendorId is
    // invisible to RLS here and throws not-found, never reaching the create below. The composite
    // FK on VendorProduct.vendorId is the database-level backstop behind this same guard.
    await tx.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true } });
    const product = await tx.vendorProduct.create({
      data: {
        organizationId,
        vendorId,
        name: input.name,
        description: input.description || null,
        category: input.category,
        priceKobo: nairaToKobo(input.priceNaira),
        imageUrl: input.imageUrl || null,
        fanClubDiscountBps: Math.round(input.fanClubDiscountPercent * 100),
        approvalStatus: ProductApproval.PENDING,
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "VENDOR_PRODUCT_CREATED",
      entityType: "VendorProduct",
      entityId: product.id,
      details: {
        vendorId,
        name: product.name,
        category: product.category,
        priceKobo: product.priceKobo,
      },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
}

const inventorySchema = z.object({
  eventId: z.string().min(1),
  productId: z.string().min(1),
  stock: z.coerce.number().int().min(0),
});

export async function setVendorInventory(
  vendorId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  const input = inventorySchema.parse(formDataToRecord(formData));
  await withOrganizationContext(organizationId, async (tx) => {
    const product = await tx.vendorProduct.findFirstOrThrow({
      where: { id: input.productId, vendorId },
    });
    // eventId is client-submitted (a <select> value) - a foreign-org eventId is invisible to
    // RLS here and throws not-found, never reaching the upsert below.
    await tx.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { id: true } });
    const currentInventory = await tx.vendorInventory.findUnique({
      where: {
        eventId_productId: {
          eventId: input.eventId,
          productId: input.productId,
        },
      },
    });
    if (
      currentInventory &&
      input.stock < currentInventory.reserved + currentInventory.sold
    ) {
      throw new Error("STOCK_BELOW_COMMITTED_QUANTITY");
    }
    const inventory = await tx.vendorInventory.upsert({
      where: {
        eventId_productId: {
          eventId: input.eventId,
          productId: input.productId,
        },
      },
      create: { ...input, organizationId },
      update: { stock: input.stock },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "VENDOR_INVENTORY_SET",
      entityType: "VendorInventory",
      entityId: inventory.id,
      details: {
        eventId: input.eventId,
        productId: product.id,
        stock: input.stock,
      },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
}

const campaignSchema = z.object({
  eventId: z.string(),
  productId: z.string(),
  name: z.string().trim().min(2).max(100),
  sponsorName: z.string().trim().min(2).max(100),
});

export async function createSponsorCampaign(
  vendorId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  const input = campaignSchema.parse(formDataToRecord(formData));
  await withOrganizationContext(organizationId, async (tx) => {
    if (input.productId) {
      await tx.vendorProduct.findFirstOrThrow({
        where: { id: input.productId, vendorId },
      });
    }
    // eventId (optional, "all events" otherwise) is client-submitted - a foreign-org eventId is
    // invisible to RLS here and throws not-found, never reaching the create below.
    if (input.eventId) {
      await tx.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { id: true } });
    }
    const campaign = await tx.sponsorCampaign.create({
      data: {
        organizationId,
        name: input.name,
        sponsorName: input.sponsorName,
        eventId: input.eventId || null,
        productId: input.productId || null,
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "SPONSOR_CAMPAIGN_CREATED",
      entityType: "SponsorCampaign",
      entityId: campaign.id,
      details: {
        eventId: campaign.eventId,
        productId: campaign.productId,
        sponsorName: campaign.sponsorName,
      },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
}

const promoSchema = z.object({
  campaignId: z.string(),
  eventId: z.string(),
  code: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  discountPercent: z.coerce.number().min(0).max(100),
  maxRedemptions: z.coerce.number().int().min(0),
});

export async function createPromoCode(vendorId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  const input = promoSchema.parse(formDataToRecord(formData));
  await withOrganizationContext(organizationId, async (tx) => {
    if (input.campaignId) {
      const campaign = await tx.sponsorCampaign.findFirst({
        where: {
          id: input.campaignId,
          OR: [
            { productId: null },
            { product: { vendorId } },
          ],
        },
      });
      if (!campaign) throw new Error("INVALID_CAMPAIGN");
    }
    if (input.eventId) {
      await tx.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { id: true } });
    }
    // PromoCode.code is a bare GLOBAL @unique (platform-wide, not organizationId-composite) -
    // this create can collide with another organization's identically-named code (e.g. both
    // orgs wanting "VIP"). This is a real, known limitation - see the Stage 5.2B-4 doc's stop
    // condition section. Not silently worked around here: a global-uniqueness violation surfaces
    // as Prisma's ordinary P2002 error, which the caller must handle as "code already in use"
    // (true today whether the conflict is same-org or, once a second org exists, cross-org).
    const promo = await tx.promoCode.create({
      data: {
        organizationId,
        code: input.code,
        eventId: input.eventId || null,
        sponsorCampaignId: input.campaignId || null,
        discountBps: Math.round(input.discountPercent * 100),
        maxRedemptions: input.maxRedemptions || null,
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "PROMO_CODE_CREATED",
      entityType: "PromoCode",
      entityId: promo.id,
      details: {
        code: promo.code,
        eventId: promo.eventId,
        sponsorCampaignId: promo.sponsorCampaignId,
        discountBps: promo.discountBps,
      },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
}

// F5 menu approvals: new products start PENDING and sell only after approval. The wallet
// and ticket surfaces filter to APPROVED products, so rejection immediately unsells.
export async function setProductApproval(vendorId: string, productId: string, approval: ProductApproval) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  if (approval !== ProductApproval.APPROVED && approval !== ProductApproval.REJECTED) {
    throw new Error("INVALID_APPROVAL");
  }
  await withOrganizationContext(organizationId, async (tx) => {
    const product = await tx.vendorProduct.findFirstOrThrow({ where: { id: productId, vendorId } });
    if (product.approvalStatus === approval) return;
    await tx.vendorProduct.update({ where: { id: productId }, data: { approvalStatus: approval } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "VENDOR_PRODUCT_APPROVAL_CHANGED",
      entityType: "VendorProduct",
      entityId: productId,
      details: { vendorId, from: product.approvalStatus, to: approval },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
}

// F5 vendor onboarding state: suspending flips isActive (unsells the vendor everywhere
// listings filter on it); reactivation restores. Audited both ways.
export async function setVendorActive(vendorId: string, active: boolean) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });
    if (vendor.isActive === active) return;
    await tx.vendor.update({ where: { id: vendorId }, data: { isActive: active } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: active ? "VENDOR_REACTIVATED" : "VENDOR_SUSPENDED",
      entityType: "Vendor",
      entityId: vendorId,
      details: { name: vendor.name },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
}

// F5 commission configuration: league share on vendor gross, in basis points (0–100%).
// Payout math reads this value; see commissionSplitKobo.
export async function setVendorCommission(vendorId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  const percent = z.coerce.number().min(0).max(100).parse(formData.get("commissionPercent"));
  await withOrganizationContext(organizationId, async (tx) => {
    const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } });
    const commissionBps = Math.round(percent * 100);
    if (vendor.commissionBps === commissionBps) return;
    await tx.vendor.update({ where: { id: vendorId }, data: { commissionBps } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "VENDOR_COMMISSION_CHANGED",
      entityType: "Vendor",
      entityId: vendorId,
      details: { name: vendor.name, fromBps: vendor.commissionBps, toBps: commissionBps },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
}

// Bachs Connect sub-account (F5.3): gives the vendor its own financial identity so payout
// reconciliation is clean. Creates the account and mints a hosted onboarding link, then
// sends the operator straight there. Idempotent — reconnecting reopens onboarding.
export async function connectBachsAccount(vendorId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("vendor:manage");
  const { redirect } = await import("next/navigation");
  const vendor = await withOrganizationContext(organizationId, (tx) =>
    tx.vendor.findUniqueOrThrow({ where: { id: vendorId } }),
  );
  const account = await createConnectedAccount({
    name: vendor.name,
    email: vendor.email ?? `vendor-${vendor.id}@neonultra.ng`,
    metadata: { vendorId: vendor.id, organizationId },
  });
  const baseUrl = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const link = await createAccountLink(account.account_id, {
    refreshUrl: `${baseUrl}/vendors/${vendorId}`,
    returnUrl: `${baseUrl}/vendors/${vendorId}`,
  });
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.vendor.update({
      where: { id: vendorId },
      data: { bachsAccountId: account.account_id, bachsOnboardingUrl: link.url },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "VENDOR_BACHS_ACCOUNT_CONNECTED",
      entityType: "Vendor",
      entityId: vendorId,
      details: { accountId: account.account_id },
    });
  });
  revalidatePath(`/vendors/${vendorId}`);
  redirect(link.url);
}
