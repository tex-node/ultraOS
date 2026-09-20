"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  PublicResourceLocatorType,
  PublicTokenLocatorType,
} from "@/generated/prisma/enums";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formDataToRecord } from "@/lib/club-validation";
import { prisma } from "@/lib/prisma";
import {
  checkPromoForEvent,
  promoDiscountKobo,
} from "@/lib/ticketing";
import {
  resolvePublicResourceLocator,
  upsertPublicTokenLocator,
} from "@/lib/public-locators";

const reservationSchema = z.object({
  seatZoneId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(6),
  guestName: z.string().trim().min(2).max(100),
  guestEmail: z.string().trim().email(),
  guestPhone: z.string().trim().min(7).max(30),
  promoCode: z.string().trim().max(40).optional(),
});

export async function reserveZone(eventId: string, formData: FormData) {
  const session = await auth();
  const input = reservationSchema.parse(formDataToRecord(formData));
  const now = new Date();

  const eventLookup = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.EVENT,
    eventId,
  );
  if (!eventLookup) throw new Error("EVENT_NOT_FOUND");

  // This write path needs Serializable isolation for its optimistic-concurrency capacity claim
  // below (pre-existing behavior, unchanged) - withOrganizationContext() doesn't expose an
  // isolation-level option, so its exact two-line mechanism (open the transaction, set the
  // transaction-local org config before anything else runs) is inlined here rather than
  // changing that shared helper's signature for this one caller.
  const reservation = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${eventLookup.organizationId}, true)`;
      const zone = await tx.seatZone.findFirstOrThrow({
        where: { id: input.seatZoneId, eventId, isActive: true },
        include: { event: true },
      });
      if (!["PUBLISHED", "IN_PROGRESS"].includes(zone.event.status)) {
        throw new Error("EVENT_NOT_BOOKABLE");
      }

      const membership = session?.user?.id
        ? await tx.fanMembership.findFirst({
            where: {
              userId: session.user.id,
              ...(zone.fanClubId ? { fanClubId: zone.fanClubId } : {}),
            },
          })
        : null;
      if (zone.fanClubId && !membership) {
        throw new Error("FAN_CLUB_MEMBERS_ONLY");
      }
      const canUseEarlyAccess =
        Boolean(membership) &&
        zone.fanClubEarlyAccessAt &&
        now >= zone.fanClubEarlyAccessAt;
      if (zone.salesOpenAt && now < zone.salesOpenAt && !canUseEarlyAccess) {
        throw new Error("SALES_NOT_OPEN");
      }
      if (zone.salesCloseAt && now > zone.salesCloseAt) {
        throw new Error("SALES_CLOSED");
      }
      // Optional promo code — validated BEFORE the capacity claim so a bad code never
      // burns seats. Same rules as wallet orders (active, this event or global, inside its
      // window, redemptions remaining) plus an explicit same-organization check, since
      // PromoCode.code is globally unique. Fan-club discount applies first, promo second.
      const promoInput = input.promoCode?.trim().toUpperCase() || null;
      const promoRow = promoInput
        ? await tx.promoCode.findFirst({
            where: {
              code: promoInput,
              isActive: true,
              OR: [{ eventId: null }, { eventId }],
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
              ],
            },
          })
        : null;
      const promoCheck = promoRow
        ? checkPromoForEvent(promoRow, { eventId, organizationId: eventLookup.organizationId })
        : null;
      if (promoInput && (!promoCheck || !promoCheck.ok)) {
        throw new Error(promoCheck && !promoCheck.ok ? promoCheck.reason : "INVALID_PROMO");
      }
      if (zone.reservedQuantity + input.quantity > zone.capacity) {
        throw new Error("ZONE_SOLD_OUT");
      }
      const claimed = await tx.seatZone.updateMany({
        where: {
          id: zone.id,
          reservedQuantity: zone.reservedQuantity,
        },
        data: { reservedQuantity: { increment: input.quantity } },
      });
      if (claimed.count !== 1) throw new Error("CAPACITY_CHANGED");

      const discountBps = membership ? zone.fanClubDiscountBps : 0;
      const unitPriceKobo = Math.max(
        0,
        zone.priceKobo - Math.floor((zone.priceKobo * discountBps) / 10000),
      );
      const grossKobo = unitPriceKobo * input.quantity;

      // Increment before the reservation create: a failed create wastes a redemption slot
      // (safe direction) and can never overspend the cap, even under concurrent checkouts.
      if (promoCheck?.ok) {
        const claimedPromo = await tx.promoCode.updateMany({
          where: { id: promoCheck.promo.id, redemptionCount: promoCheck.promo.redemptionCount },
          data: { redemptionCount: { increment: 1 } },
        });
        if (claimedPromo.count !== 1) throw new Error("PROMO_CHANGED");
      }
      const promoDiscount = promoCheck?.ok ? promoDiscountKobo(grossKobo, promoCheck.promo.discountBps) : 0;
      const totalKobo = grossKobo - promoDiscount;
      const reservation = await tx.seatReservation.create({
        data: {
          organizationId: eventLookup.organizationId,
          eventId,
          seatZoneId: zone.id,
          userId: session?.user?.id ?? null,
          fanClubId: membership?.fanClubId ?? null,
          guestName: input.guestName,
          guestEmail: input.guestEmail.toLowerCase(),
          guestPhone: input.guestPhone,
          quantity: input.quantity,
          unitPriceKobo,
          totalKobo,
          promoCodeId: promoCheck?.ok ? promoCheck.promo.id : null,
          paymentStatus: totalKobo === 0 ? "PAID" : "UNPAID",
          paidAt: totalKobo === 0 ? now : null,
          // organizationId is deliberately omitted here - Ticket.reservation is now a composite
          // FK keyed on (organizationId, reservationId), so Prisma derives this nested Ticket's
          // organizationId from the parent SeatReservation.create's own organizationId above,
          // the same way it already derives reservationId from the nesting itself.
          ticket: {
            create: {
              userId: session?.user?.id ?? null,
              code: randomUUID().replaceAll("-", ""),
            },
          },
        },
        include: { ticket: true },
      });
      if (reservation.ticket) {
        await upsertPublicTokenLocator(tx, {
          tokenType: PublicTokenLocatorType.TICKET,
          rawToken: reservation.ticket.code,
          organizationId: eventLookup.organizationId,
          resourceId: reservation.ticket.id,
        });
      }
      return reservation;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  redirect(`/public/tickets/${reservation.ticket?.code}`);
}
