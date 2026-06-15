"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  calculateOrderPricing,
  remainingInventory,
} from "@/lib/event-operations";
import { prisma } from "@/lib/prisma";

export async function createWalletOrder(
  ticketCode: string,
  formData: FormData,
) {
  const promoInput = z.string().trim().max(40).parse(formData.get("promoCode") ?? "");
  const requested = [...formData.entries()]
    .filter(([key]) => key.startsWith("quantity:"))
    .map(([key, value]) => ({
      inventoryId: key.slice("quantity:".length),
      quantity: Number(value),
    }))
    .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);

  const order = await prisma.$transaction(
    async (tx) => {
      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { code: ticketCode },
        include: {
          reservation: {
            include: { order: true },
          },
        },
      });
      if (ticket.reservation.order) {
        return ticket.reservation.order;
      }

      const inventories = requested.length
        ? await tx.vendorInventory.findMany({
            where: {
              id: { in: requested.map((item) => item.inventoryId) },
              eventId: ticket.reservation.eventId,
              product: { isActive: true },
            },
            include: { product: true },
          })
        : [];
      if (inventories.length !== requested.length) {
        throw new Error("INVALID_INVENTORY");
      }

      const itemData = [];
      const pricedLines: Array<{
        subtotalKobo: number;
        discountKobo: number;
      }> = [];
      for (const request of requested) {
        const inventory = inventories.find((row) => row.id === request.inventoryId);
        if (!inventory) throw new Error("INVALID_INVENTORY");
        if (
          remainingInventory(
            inventory.stock,
            inventory.reserved,
            inventory.sold,
          ) < request.quantity
        ) {
          throw new Error("OUT_OF_STOCK");
        }
        const claimed = await tx.vendorInventory.updateMany({
          where: {
            id: inventory.id,
            reserved: inventory.reserved,
            sold: inventory.sold,
            stock: inventory.stock,
          },
          data: { reserved: { increment: request.quantity } },
        });
        if (claimed.count !== 1) throw new Error("INVENTORY_CHANGED");

        const lineSubtotal = inventory.product.priceKobo * request.quantity;
        const lineDiscount = ticket.reservation.fanClubId
          ? Math.floor(
              (lineSubtotal * inventory.product.fanClubDiscountBps) / 10000,
            )
          : 0;
        pricedLines.push({
          subtotalKobo: lineSubtotal,
          discountKobo: lineDiscount,
        });
        itemData.push({
          productId: inventory.productId,
          quantity: request.quantity,
          unitPriceKobo: inventory.product.priceKobo,
          discountKobo: lineDiscount,
          totalKobo: lineSubtotal - lineDiscount,
        });
      }

      const promo = promoInput
        ? await tx.promoCode.findFirst({
            where: {
              code: promoInput.toUpperCase(),
              isActive: true,
              OR: [{ eventId: null }, { eventId: ticket.reservation.eventId }],
              AND: [
                {
                  OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
                },
                {
                  OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
                },
              ],
            },
          })
        : null;
      if (promoInput && !promo) throw new Error("INVALID_PROMO");
      if (
        promo?.maxRedemptions &&
        promo.redemptionCount >= promo.maxRedemptions
      ) {
        throw new Error("PROMO_EXHAUSTED");
      }

      const seatSubtotal =
        ticket.reservation.paymentStatus === "PAID"
          ? 0
          : ticket.reservation.totalKobo;
      const pricing = calculateOrderPricing(
        seatSubtotal,
        pricedLines,
        promo?.discountBps ?? 0,
      );

      return tx.order.create({
        data: {
          eventId: ticket.reservation.eventId,
          userId: ticket.reservation.userId,
          reservationId: ticket.reservation.id,
          fanClubId: ticket.reservation.fanClubId,
          guestName: ticket.reservation.guestName,
          guestEmail: ticket.reservation.guestEmail,
          guestPhone: ticket.reservation.guestPhone,
          promoCodeId: promo?.id,
          subtotalKobo: pricing.subtotalKobo,
          discountKobo: pricing.discountKobo,
          totalKobo: pricing.totalKobo,
          paymentStatus: "PENDING",
          status: "PENDING_PAYMENT",
          collectionCode: randomUUID().replaceAll("-", ""),
          items: { create: itemData },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  redirect(`/public/orders/${order.collectionCode}`);
}
