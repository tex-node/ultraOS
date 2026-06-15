"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  AccreditationCategory,
  AccreditationStatus,
  EventStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { nairaToKobo } from "@/lib/money";
import { prisma } from "@/lib/prisma";

const eventSchema = z.object({
  name: z.string().trim().min(3).max(120),
  seasonId: z.string().min(1),
  venueId: z.string().min(1),
  date: z.string().min(1),
  doorsOpenTime: z.string(),
  startTime: z.string().min(1),
  endTime: z.string(),
});

export async function createEvent(formData: FormData) {
  const session = await requirePermission("event:manage");
  const input = eventSchema.parse(formDataToRecord(formData));
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        name: input.name,
        seasonId: input.seasonId,
        venueId: input.venueId,
        date: new Date(input.date),
        doorsOpenTime: input.doorsOpenTime
          ? new Date(input.doorsOpenTime)
          : null,
        startTime: new Date(input.startTime),
        endTime: input.endTime ? new Date(input.endTime) : null,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "EVENT_CREATED",
      entityType: "Event",
      entityId: created.id,
      details: { name: created.name, venueId: created.venueId },
    });
    return created;
  });
  revalidatePath("/events");
  redirect(`/events/${event.id}`);
}

export async function setEventStatus(eventId: string, status: EventStatus) {
  const session = await requirePermission("event:manage");
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { status } });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "EVENT_STATUS_CHANGED",
      entityType: "Event",
      entityId: eventId,
      details: { status },
    });
  });
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
}

const sectionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()),
  capacity: z.coerce.number().int().positive(),
});

export async function createVenueSection(
  venueId: string,
  eventId: string,
  formData: FormData,
) {
  const session = await requirePermission("event:manage");
  const input = sectionSchema.parse(formDataToRecord(formData));
  await prisma.$transaction(async (tx) => {
    const section = await tx.venueSection.create({
      data: { venueId, ...input },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "VENUE_SECTION_CREATED",
      entityType: "VenueSection",
      entityId: section.id,
      details: { venueId, name: section.name, capacity: section.capacity },
    });
  });
  revalidatePath(`/events/${eventId}`);
}

const zoneSchema = z.object({
  venueSectionId: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  capacity: z.coerce.number().int().positive(),
  priceNaira: z.string().min(1),
  salesOpenAt: z.string(),
  salesCloseAt: z.string(),
  fanClubId: z.string(),
  fanClubEarlyAccessAt: z.string(),
  fanClubDiscountPercent: z.coerce.number().min(0).max(100),
});

export async function createSeatZone(eventId: string, formData: FormData) {
  const session = await requirePermission("event:manage");
  const input = zoneSchema.parse(formDataToRecord(formData));
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { venueId: true },
  });
  const section = await prisma.venueSection.findFirst({
    where: { id: input.venueSectionId, venueId: event.venueId, isActive: true },
  });
  const allocatedCapacity = section
    ? await prisma.seatZone.aggregate({
        where: { eventId, venueSectionId: section.id },
        _sum: { capacity: true },
      })
    : null;
  if (
    !section ||
    (allocatedCapacity?._sum.capacity ?? 0) + input.capacity > section.capacity
  ) {
    throw new Error("INVALID_SECTION_CAPACITY");
  }
  await prisma.$transaction(async (tx) => {
    const zone = await tx.seatZone.create({
      data: {
        eventId,
        venueSectionId: input.venueSectionId,
        name: input.name,
        capacity: input.capacity,
        priceKobo: nairaToKobo(input.priceNaira),
        salesOpenAt: input.salesOpenAt ? new Date(input.salesOpenAt) : null,
        salesCloseAt: input.salesCloseAt ? new Date(input.salesCloseAt) : null,
        fanClubId: input.fanClubId || null,
        fanClubEarlyAccessAt: input.fanClubEarlyAccessAt
          ? new Date(input.fanClubEarlyAccessAt)
          : null,
        fanClubDiscountBps: Math.round(input.fanClubDiscountPercent * 100),
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "SEAT_ZONE_CREATED",
      entityType: "SeatZone",
      entityId: zone.id,
      details: {
        eventId,
        name: zone.name,
        capacity: zone.capacity,
        priceKobo: zone.priceKobo,
        fanClubId: zone.fanClubId,
      },
    });
  });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/public/events/${eventId}`);
}

const accreditationSchema = z.object({
  personName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(30),
  category: z.enum(AccreditationCategory),
  organization: z.string().trim().max(100),
  roleTitle: z.string().trim().max(100),
});

export async function createAccreditation(eventId: string, formData: FormData) {
  const session = await requirePermission("accreditation:manage");
  const input = accreditationSchema.parse(formDataToRecord(formData));
  await prisma.$transaction(async (tx) => {
    const accreditation = await tx.accreditation.create({
      data: {
        eventId,
        personName: input.personName,
        email: input.email || null,
        phone: input.phone || null,
        category: input.category,
        organization: input.organization || null,
        roleTitle: input.roleTitle || null,
        code: randomUUID().replaceAll("-", ""),
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ACCREDITATION_CREATED",
      entityType: "Accreditation",
      entityId: accreditation.id,
      details: {
        eventId,
        personName: accreditation.personName,
        category: accreditation.category,
      },
    });
  });
  revalidatePath(`/events/${eventId}`);
}

export async function setAccreditationStatus(
  accreditationId: string,
  eventId: string,
  status: AccreditationStatus,
) {
  const session = await requirePermission("accreditation:manage");
  await prisma.$transaction(async (tx) => {
    await tx.accreditation.update({
      where: { id: accreditationId },
      data: {
        status,
        approvedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ACCREDITATION_STATUS_CHANGED",
      entityType: "Accreditation",
      entityId: accreditationId,
      details: { status, eventId },
    });
  });
  revalidatePath(`/events/${eventId}`);
}

export async function confirmReservationPayment(
  reservationId: string,
  eventId: string,
  formData: FormData,
) {
  const session = await requirePermission("reservation:manage");
  const reference = z.string().trim().min(2).max(100).parse(formData.get("reference"));
  await prisma.$transaction(async (tx) => {
    await tx.seatReservation.update({
      where: { id: reservationId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentReference: reference,
        paidAt: new Date(),
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "RESERVATION_PAYMENT_CONFIRMED",
      entityType: "SeatReservation",
      entityId: reservationId,
      details: { eventId, reference },
    });
  });
  revalidatePath(`/events/${eventId}`);
}
