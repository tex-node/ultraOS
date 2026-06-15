"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ProductCategory } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { nairaToKobo } from "@/lib/money";
import { prisma } from "@/lib/prisma";

const vendorSchema = z.object({
  name: z.string().trim().min(2).max(100),
  contactName: z.string().trim().max(100),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(30),
});

export async function createVendor(formData: FormData) {
  const session = await requirePermission("vendor:manage");
  const input = vendorSchema.parse(formDataToRecord(formData));
  const vendor = await prisma.$transaction(async (tx) => {
    const created = await tx.vendor.create({
      data: {
        name: input.name,
        contactName: input.contactName || null,
        email: input.email || null,
        phone: input.phone || null,
      },
    });
    await writeAuditLog(tx, {
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
  const session = await requirePermission("vendor:manage");
  const input = productSchema.parse(formDataToRecord(formData));
  await prisma.$transaction(async (tx) => {
    const product = await tx.vendorProduct.create({
      data: {
        vendorId,
        name: input.name,
        description: input.description || null,
        category: input.category,
        priceKobo: nairaToKobo(input.priceNaira),
        imageUrl: input.imageUrl || null,
        fanClubDiscountBps: Math.round(input.fanClubDiscountPercent * 100),
      },
    });
    await writeAuditLog(tx, {
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
  const session = await requirePermission("vendor:manage");
  const input = inventorySchema.parse(formDataToRecord(formData));
  const product = await prisma.vendorProduct.findFirstOrThrow({
    where: { id: input.productId, vendorId },
  });
  const currentInventory = await prisma.vendorInventory.findUnique({
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
  await prisma.$transaction(async (tx) => {
    const inventory = await tx.vendorInventory.upsert({
      where: {
        eventId_productId: {
          eventId: input.eventId,
          productId: input.productId,
        },
      },
      create: input,
      update: { stock: input.stock },
    });
    await writeAuditLog(tx, {
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
  const session = await requirePermission("vendor:manage");
  const input = campaignSchema.parse(formDataToRecord(formData));
  if (input.productId) {
    await prisma.vendorProduct.findFirstOrThrow({
      where: { id: input.productId, vendorId },
    });
  }
  await prisma.$transaction(async (tx) => {
    const campaign = await tx.sponsorCampaign.create({
      data: {
        name: input.name,
        sponsorName: input.sponsorName,
        eventId: input.eventId || null,
        productId: input.productId || null,
      },
    });
    await writeAuditLog(tx, {
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
  const session = await requirePermission("vendor:manage");
  const input = promoSchema.parse(formDataToRecord(formData));
  if (input.campaignId) {
    const campaign = await prisma.sponsorCampaign.findFirst({
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
  await prisma.$transaction(async (tx) => {
    const promo = await tx.promoCode.create({
      data: {
        code: input.code,
        eventId: input.eventId || null,
        sponsorCampaignId: input.campaignId || null,
        discountBps: Math.round(input.discountPercent * 100),
        maxRedemptions: input.maxRedemptions || null,
      },
    });
    await writeAuditLog(tx, {
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
