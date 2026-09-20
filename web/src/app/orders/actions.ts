"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { orderTransitionError } from "@/lib/ticketing";
import { vendorScopeFrom } from "@/lib/vendor-scope";
import type { Prisma } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";

// F5 least privilege: vendor-linked accounts act only on orders made up entirely of
// their own vendor's items; platform staff (event:manage) are unscoped. Throws when
// the actor holds no order scope at all.
async function scopedOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  roles: UserRole[] | undefined,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: { select: { vendorId: true } } } }, promoCode: true, reservation: true },
  });
  const vendor = await tx.vendor.findFirst({ where: { userId }, select: { id: true } });
  const scope = vendorScopeFrom(roles, vendor?.id ?? null);
  if (scope.kind === "none") throw new Error("ORDER_ACCESS_DENIED");
  if (scope.kind === "vendor" && !order.items.every((item) => item.product.vendorId === scope.vendorId)) {
    throw new Error("ORDER_ACCESS_DENIED");
  }
  return order;
}

export async function confirmOrderPayment(
  orderId: string,
  formData: FormData,
) {
  const { session, organizationId } = await requirePermissionWithOrganization("order:manage");
  const reference = z.string().trim().min(2).max(100).parse(formData.get("reference"));
  await withOrganizationContext(organizationId, async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, reservation: true, promoCode: true },
    });
    await scopedOrder(tx, orderId, session.user.id, session.user.roles);
    if (order.paymentStatus === "PAID") return;
    for (const item of order.items) {
      const inventory = await tx.vendorInventory.findUniqueOrThrow({
        where: {
          eventId_productId: {
            eventId: order.eventId,
            productId: item.productId,
          },
        },
      });
      if (inventory.reserved < item.quantity) {
        throw new Error("RESERVED_STOCK_MISSING");
      }
      await tx.vendorInventory.update({
        where: { id: inventory.id },
        data: {
          reserved: { decrement: item.quantity },
          sold: { increment: item.quantity },
        },
      });
      await tx.sponsorCampaign.updateMany({
        where: {
          isActive: true,
          productId: item.productId,
          OR: [{ eventId: null }, { eventId: order.eventId }],
        },
        data: {
          unitsSold: { increment: item.quantity },
          revenueKobo: { increment: item.totalKobo },
        },
      });
    }
    if (order.promoCodeId) {
      await tx.promoCode.update({
        where: { id: order.promoCodeId },
        data: { redemptionCount: { increment: 1 } },
      });
      if (order.promoCode?.sponsorCampaignId) {
        await tx.sponsorCampaign.update({
          where: { id: order.promoCode.sponsorCampaignId },
          data: { redemptions: { increment: 1 } },
        });
      }
    }
    const now = new Date();
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        paymentStatus: "PAID",
        paymentReference: reference,
        paidAt: now,
      },
    });
    if (order.reservationId && order.reservation?.paymentStatus !== "PAID") {
      await tx.seatReservation.update({
        where: { id: order.reservationId },
        data: {
          paymentStatus: "PAID",
          paymentReference: reference,
          paidAt: now,
        },
      });
    }
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "ORDER_PAYMENT_CONFIRMED",
      entityType: "Order",
      entityId: orderId,
      details: {
        eventId: order.eventId,
        totalKobo: order.totalKobo,
        reference,
      },
    });
  });
  revalidatePath("/orders");
}

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const { session, organizationId } = await requirePermissionWithOrganization("order:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    const order = await scopedOrder(tx, orderId, session.user.id, session.user.roles);
    const blocked = orderTransitionError(order, status);
    if (blocked) throw new Error(blocked);
    await tx.order.update({ where: { id: orderId }, data: { status } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "ORDER_STATUS_CHANGED",
      entityType: "Order",
      entityId: orderId,
      details: { status, eventId: order.eventId },
    });
  });
  revalidatePath("/orders");
}

// Cancelling an unpaid order releases its reserved stock; cancelling a paid order leaves
// sold stock in place and records that the refund is manual (no payment provider yet).
export async function cancelOrder(orderId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("order:manage");
  const reason = z.string().trim().min(5, "Give a reason for cancellation.").parse(formData.get("reason"));
  await withOrganizationContext(organizationId, async (tx) => {
    const order = await scopedOrder(tx, orderId, session.user.id, session.user.roles);
    const blocked = orderTransitionError(order, "CANCELLED");
    if (blocked) throw new Error(blocked);
    if (order.paymentStatus !== "PAID") {
      for (const item of order.items) {
        await tx.vendorInventory.updateMany({
          where: { eventId: order.eventId, productId: item.productId },
          data: { reserved: { decrement: item.quantity } },
        });
      }
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "ORDER_CANCELLED",
      entityType: "Order",
      entityId: orderId,
      details: { eventId: order.eventId, reason, paid: order.paymentStatus === "PAID", manualRefund: order.paymentStatus === "PAID" },
    });
  });
  revalidatePath("/orders");
}
