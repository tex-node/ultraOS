"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function confirmOrderPayment(
  orderId: string,
  formData: FormData,
) {
  const session = await requirePermission("order:manage");
  const reference = z.string().trim().min(2).max(100).parse(formData.get("reference"));
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, reservation: true, promoCode: true },
    });
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
  const session = await requirePermission("order:manage");
  if (!["PAID", "PREPARING", "READY"].includes(status)) {
    throw new Error("INVALID_ORDER_STATUS");
  }
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.paymentStatus !== "PAID") throw new Error("ORDER_NOT_PAID");
    if (order.status === "COLLECTED" || order.status === "CANCELLED") {
      throw new Error("ORDER_CLOSED");
    }
    await tx.order.update({ where: { id: orderId }, data: { status } });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ORDER_STATUS_CHANGED",
      entityType: "Order",
      entityId: orderId,
      details: { status, eventId: order.eventId },
    });
  });
  revalidatePath("/orders");
}
