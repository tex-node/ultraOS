"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formDataToRecord } from "@/lib/club-validation";
import { prisma } from "@/lib/prisma";

const reservationSchema = z.object({
  seatZoneId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(6),
  guestName: z.string().trim().min(2).max(100),
  guestEmail: z.string().trim().email(),
  guestPhone: z.string().trim().min(7).max(30),
});

export async function reserveZone(eventId: string, formData: FormData) {
  const session = await auth();
  const input = reservationSchema.parse(formDataToRecord(formData));
  const now = new Date();
  const reservation = await prisma.$transaction(
    async (tx) => {
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
      const totalKobo = unitPriceKobo * input.quantity;
      return tx.seatReservation.create({
        data: {
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
          paymentStatus: totalKobo === 0 ? "PAID" : "UNPAID",
          paidAt: totalKobo === 0 ? now : null,
          ticket: {
            create: {
              userId: session?.user?.id ?? null,
              code: randomUUID().replaceAll("-", ""),
            },
          },
        },
        include: { ticket: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  redirect(`/public/tickets/${reservation.ticket?.code}`);
}
