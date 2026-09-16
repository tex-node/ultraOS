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
  PublicResourceLocatorType,
} from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { normalizeEventStaffRole } from "@/lib/event-staff";
import { nairaToKobo } from "@/lib/money";
import { upsertPublicResourceLocator } from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

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
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const input = eventSchema.parse(formDataToRecord(formData));
  const event = await withOrganizationContext(organizationId, async (tx) => {
    // seasonId/venueId are client-submitted <select> values - a foreign-org id is invisible to
    // RLS here and throws not-found, never reaching the create below. The composite FK on
    // Event.venueId is the database-level backstop behind the venue half of this guard (Season
    // isn't hardened to composite this stage - see the doc's relation inventory).
    await tx.season.findUniqueOrThrow({ where: { id: input.seasonId }, select: { id: true } });
    await tx.venue.findUniqueOrThrow({ where: { id: input.venueId }, select: { id: true } });
    const created = await tx.event.create({
      data: {
        organizationId,
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
    await upsertPublicResourceLocator(tx, {
      resourceType: PublicResourceLocatorType.EVENT,
      publicKey: created.id,
      organizationId,
      resourceId: created.id,
    });
    await writeAuditLog(tx, {
      organizationId,
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
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { status } });
    await writeAuditLog(tx, {
      organizationId,
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
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const input = sectionSchema.parse(formDataToRecord(formData));
  await withOrganizationContext(organizationId, async (tx) => {
    // venueId arrives as a route-derived value (the event's own venueId, rendered into the
    // form's bound action args) - a foreign-org venueId is invisible to RLS here and throws
    // not-found, never reaching the create below.
    await tx.venue.findUniqueOrThrow({ where: { id: venueId }, select: { id: true } });
    const section = await tx.venueSection.create({
      data: { organizationId, venueId, ...input },
    });
    await writeAuditLog(tx, {
      organizationId,
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
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const input = zoneSchema.parse(formDataToRecord(formData));
  await withOrganizationContext(organizationId, async (tx) => {
    const event = await tx.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { venueId: true },
    });
    // fanClubId (optional) is a client-submitted <select> value - a foreign-org fanClubId is
    // invisible to RLS here and throws not-found, never reaching the create below. Not
    // composite-FK hardened this stage (nullable + ON DELETE SET NULL - see the doc).
    if (input.fanClubId) {
      await tx.fanClub.findUniqueOrThrow({ where: { id: input.fanClubId }, select: { id: true } });
    }
    const section = await tx.venueSection.findFirst({
      where: { id: input.venueSectionId, venueId: event.venueId, isActive: true },
    });
    const allocatedCapacity = section
      ? await tx.seatZone.aggregate({
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
    const zone = await tx.seatZone.create({
      data: {
        organizationId,
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
      organizationId,
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
  const { session, organizationId } = await requirePermissionWithOrganization("accreditation:manage");
  const input = accreditationSchema.parse(formDataToRecord(formData));
  await withOrganizationContext(organizationId, async (tx) => {
    const accreditation = await tx.accreditation.create({
      data: {
        organizationId,
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
      organizationId,
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
  const { session, organizationId } = await requirePermissionWithOrganization("accreditation:manage");
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.accreditation.update({
      where: { id: accreditationId },
      data: {
        status,
        approvedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    await writeAuditLog(tx, {
      organizationId,
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
  const { session, organizationId } = await requirePermissionWithOrganization("reservation:manage");
  const reference = z.string().trim().min(2).max(100).parse(formData.get("reference"));
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.seatReservation.update({
      where: { id: reservationId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentReference: reference,
        paidAt: new Date(),
      },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "RESERVATION_PAYMENT_CONFIRMED",
      entityType: "SeatReservation",
      entityId: reservationId,
      details: { eventId, reference },
    });
  });
  revalidatePath(`/events/${eventId}`);
}

const eventStaffSchema = z.object({
  eventId: z.string().min(1),
  role: z.string().min(1),
  email: z.string().trim().toLowerCase().email("Enter the staff member's email address."),
});

// Grants an event-scoped game-day role (game controller, scorekeeper, statistician) to a user by
// email. The permission takes effect only for this event's fixtures - see lib/event-staff.ts and
// requireFixturePermission. Re-assigning a previously revoked role reactivates it.
export async function assignEventStaff(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const input = eventStaffSchema.parse(formDataToRecord(formData));
  const role = normalizeEventStaffRole(input.role);
  if (!role) throw new Error(`Unknown event staff role: ${input.role}`);

  await withOrganizationContext(organizationId, async (tx) => {
    await tx.event.findUniqueOrThrow({ where: { id: input.eventId }, select: { id: true } });
    const user = await tx.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new Error("No user account exists with that email address.");

    await tx.eventStaffAssignment.upsert({
      where: { eventId_role_userId: { eventId: input.eventId, role, userId: user.id } },
      create: {
        organizationId,
        eventId: input.eventId,
        role,
        userId: user.id,
        personName: user.name,
        status: "OPEN",
      },
      update: { status: "OPEN", personName: user.name },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "EVENT_STAFF_ASSIGNED",
      entityType: "EventStaffAssignment",
      entityId: input.eventId,
      details: { eventId: input.eventId, role, staffUserId: user.id, staffEmail: user.email },
    });
  });
  revalidatePath(`/events/${input.eventId}`);
}

// Revokes an event-scoped role. The row is kept (status CANCELLED) so the grant history survives -
// userHasEventPermission only counts non-cancelled assignments.
export async function revokeEventStaff(formData: FormData) {  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) throw new Error("Missing assignment.");

  const eventId = await withOrganizationContext(organizationId, async (tx) => {
    const assignment = await tx.eventStaffAssignment.findFirstOrThrow({
      where: { id: assignmentId, organizationId },
      select: { id: true, eventId: true, role: true, userId: true },
    });
    await tx.eventStaffAssignment.update({
      where: { id: assignment.id },
      data: { status: "CANCELLED" },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "EVENT_STAFF_REVOKED",
      entityType: "EventStaffAssignment",
      entityId: assignment.id,
      details: { eventId: assignment.eventId, role: assignment.role, staffUserId: assignment.userId },
    });
    return assignment.eventId;
  });
  revalidatePath(`/events/${eventId}`);
}

const attachFixturesSchema = z.object({
  eventId: z.string().min(1),
  seasonId: z.string().min(1),
  divisionId: z.string().optional(),
});

// Attaches fixtures that are not yet on an event to this one, so event-scoped staff can operate them.
// Scoped to the event's own season (and optionally one division) and never re-parents a fixture that
// already belongs to another event. Returns the number of fixtures attached.
export async function attachFixturesToEvent(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const input = attachFixturesSchema.parse(formDataToRecord(formData));
  const divisionId = input.divisionId?.trim() ? input.divisionId.trim() : null;
  await withOrganizationContext(organizationId, async (tx) => {
    const event = await tx.event.findUniqueOrThrow({
      where: { id: input.eventId },
      select: { id: true, seasonId: true },
    });
    if (event.seasonId !== input.seasonId) {
      throw new Error("That season is not this event's season.");
    }

    const updated = await tx.fixture.updateMany({
      where: {
        seasonId: input.seasonId,
        eventId: null, // never steal a fixture from another event
        ...(divisionId ? { divisionId } : {}),
      },
      data: { eventId: input.eventId },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId: session.user.id,
      action: "EVENT_FIXTURES_ATTACHED",
      entityType: "Event",
      entityId: input.eventId,
      details: { seasonId: input.seasonId, divisionId, count: updated.count },
    });
    return updated.count;
  });

  revalidatePath(`/events/${input.eventId}`);
}
