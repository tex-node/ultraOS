"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { PublicTokenLocatorType } from "@/generated/prisma/enums";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  calculateOrderPricing,
  remainingInventory,
} from "@/lib/event-operations";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { sendSmtpMail } from "@/lib/smtp";
import {
  locatorMatchesResource,
  resolvePublicTokenLocator,
  upsertPublicTokenLocator,
} from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

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

  const ticketLookup = await resolvePublicTokenLocator(
    prisma,
    PublicTokenLocatorType.TICKET,
    ticketCode,
  );
  if (!ticketLookup) throw new Error("INVALID_TICKET");

  // This write path needs Serializable isolation for its optimistic-concurrency inventory
  // claim below (pre-existing behavior, unchanged) - withOrganizationContext() doesn't expose an
  // isolation-level option, so its exact two-line mechanism (open the transaction, set the
  // transaction-local org config before anything else runs) is inlined here rather than
  // changing that shared helper's signature for this one caller.
  const order = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${ticketLookup.organizationId}, true)`;
      const ticket = await tx.ticket.findUniqueOrThrow({
        where: { id: ticketLookup.resourceId },
        include: {
          reservation: {
            include: { order: true },
          },
        },
      });
      if (!locatorMatchesResource(ticketLookup, ticket) || ticket.code !== ticketCode) {
        throw new Error("INVALID_TICKET");
      }
      if (ticket.reservation.order) {
        return ticket.reservation.order;
      }

      const inventories = requested.length
        ? await tx.vendorInventory.findMany({
          where: {
            id: { in: requested.map((item) => item.inventoryId) },
            eventId: ticket.reservation.eventId,
            product: { isActive: true, approvalStatus: "APPROVED" },
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
          organizationId: ticketLookup.organizationId,
          productId: inventory.productId,
          quantity: request.quantity,
          unitPriceKobo: inventory.product.priceKobo,
          discountKobo: lineDiscount,
          totalKobo: lineSubtotal - lineDiscount,
        });
      }

      // promoInput is client-submitted free text - PromoCode.code is a bare GLOBAL @unique
      // (not organizationId-composite), so this lookup cannot itself be scoped to "this
      // ticket's organization's promo codes only" at the query level. The AND[{eventId:null},
      // {eventId: ticket.reservation.eventId}] clause below still ties any matched code back
      // to this specific event (or a platform-wide code), which happens to keep this correct
      // under the current single-organization reality, but does not protect against two
      // organizations legitimately wanting the identical code string - see the Stage 5.2B-4
      // doc's stop-condition section. Not silently worked around here.
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

      const order = await tx.order.create({
        data: {
          organizationId: ticketLookup.organizationId,
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
      await upsertPublicTokenLocator(tx, {
        tokenType: PublicTokenLocatorType.ORDER,
        rawToken: order.collectionCode,
        organizationId: ticketLookup.organizationId,
        resourceId: order.id,
      });
      return order;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  redirect(`/public/orders/${order.collectionCode}`);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// QR email delivery (F4): sends the ticket QR details to the booking address only
// (reservation user email, else guest email) — never an arbitrary address, so this
// endpoint cannot be used as a spam relay. Returns a result instead of throwing so the
// form can render success/failure inline.
export async function emailTicketQr(ticketCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ticketLookup = await resolvePublicTokenLocator(prisma, PublicTokenLocatorType.TICKET, ticketCode);
  if (!ticketLookup) return { ok: false, error: "Ticket not found." };

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT ?? "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM;
  if (!smtpHost || !smtpUser || !smtpPassword || !emailFrom || !Number.isFinite(smtpPort)) {
    return { ok: false, error: "Email delivery is not configured for this event yet — your QR code above scans at the gate." };
  }

  const ticket = await withOrganizationContext(ticketLookup.organizationId, (tx) =>
    tx.ticket.findUnique({
      where: { id: ticketLookup.resourceId },
      include: { reservation: { include: { event: true, seatZone: true, user: { select: { email: true } } } } },
    }),
  );
  if (!ticket || !locatorMatchesResource(ticketLookup, ticket) || ticket.code !== ticketCode) {
    return { ok: false, error: "Ticket not found." };
  }
  const recipient = ticket.reservation.user?.email ?? ticket.reservation.guestEmail;
  if (!recipient) return { ok: false, error: "No email address on this booking." };

  const baseUrl = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const link = `${baseUrl}/public/tickets/${ticket.code}`;
  const subject = `Your ${ticket.reservation.event.name} ticket`;
  const text =
    `Hi ${ticket.reservation.guestName ?? "fan"},\n\n` +
    `Your ticket for ${ticket.reservation.event.name}:\n` +
    `${ticket.reservation.seatZone.name} x ${ticket.reservation.quantity}\n` +
    `Entry code: ${ticket.code}\n` +
    `Open your ticket: ${link}\n\nShow this code at the gate to check in.`;
  try {
    await sendSmtpMail(
      { from: emailFrom, host: smtpHost, password: smtpPassword, port: smtpPort, user: smtpUser },
      {
        to: recipient,
        subject,
        text,
        html: `<p>Hi ${escapeHtml(ticket.reservation.guestName ?? "fan")},</p><p>Your ticket for <b>${escapeHtml(ticket.reservation.event.name)}</b>:</p><p>${escapeHtml(ticket.reservation.seatZone.name)} × ${ticket.reservation.quantity}<br/>Entry code: <code>${escapeHtml(ticket.code)}</code></p><p><a href="${escapeHtml(link)}">Open your ticket</a> — show this code at the gate to check in.</p>`,
      },
    );
  } catch {
    return { ok: false, error: "Email could not be sent — your QR code above still scans at the gate." };
  }

  if (ticket.reservation.userId) {
    await withOrganizationContext(ticketLookup.organizationId, (tx) =>
      writeAuditLog(tx, {
        organizationId: ticketLookup.organizationId,
        userId: ticket.reservation.userId as string,
        action: "TICKET_QR_EMAILED",
        entityType: "Ticket",
        entityId: ticket.id,
        details: { reservationId: ticket.reservationId },
      }),
    );
  }
  return { ok: true };
}
