"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { withOrganizationContext } from "@/lib/tenant-context";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

function intOrUndefined(v: string) {
  if (!v) return undefined;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

export async function saveEventDebrief(eventId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const data = {
    actualAttendance: intOrUndefined(value(formData, "actualAttendance")),
    generalNotes: value(formData, "generalNotes") || null,
    weatherConditions: value(formData, "weatherConditions") || null,
    whatToImprove: value(formData, "whatToImprove") || null,
    whatWentWell: value(formData, "whatWentWell") || null,
  };

  await withOrganizationContext(organizationId, async (tx) => {
    // eventId arrives as a route param - a foreign-org eventId is invisible to RLS here and
    // throws not-found, never reaching the upsert below.
    await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true } });
    const existing = await tx.eventDebrief.findUnique({ where: { eventId } });
    const debrief = await tx.eventDebrief.upsert({
      create: { ...data, organizationId, createdById: session.user.id, eventId },
      update: data,
      where: { eventId },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: existing ? "EVENT_DEBRIEF_UPDATED" : "EVENT_DEBRIEF_CREATED",
      details: data,
      entityId: debrief.id,
      entityType: "EventDebrief",
      userId: session.user.id,
    });
  });
  revalidatePath(`/events/${eventId}/debrief`);
}

export async function saveVendorReview(eventId: string, vendorId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const rating = intOrUndefined(value(formData, "rating"));
  const wouldInviteBackRaw = value(formData, "wouldInviteBack");
  const data = {
    notes: value(formData, "notes") || null,
    rating,
    wouldInviteBack: wouldInviteBackRaw === "" ? null : wouldInviteBackRaw === "true",
  };

  await withOrganizationContext(organizationId, async (tx) => {
    // eventId/vendorId both arrive as route params - a foreign-org id is invisible to RLS here
    // and throws not-found, never reaching the upsert below. The composite FK on
    // EventVendorReview isn't hardened this stage (see the doc's relation inventory) - this
    // scoped lookup is the operative guard.
    await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true } });
    await tx.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true } });
    const review = await tx.eventVendorReview.upsert({
      create: { ...data, organizationId, createdById: session.user.id, eventId, vendorId },
      update: data,
      where: { eventId_vendorId: { eventId, vendorId } },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "EVENT_VENDOR_REVIEW_SAVED",
      details: { ...data, vendorId },
      entityId: review.id,
      entityType: "EventVendorReview",
      userId: session.user.id,
    });
  });
  revalidatePath(`/events/${eventId}/debrief`);
}

export async function saveVolunteerReview(eventId: string, volunteerId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("event:manage");
  const data = {
    notes: value(formData, "notes") || null,
    rating: intOrUndefined(value(formData, "rating")),
    roleDescription: value(formData, "roleDescription") || null,
  };

  await withOrganizationContext(organizationId, async (tx) => {
    // eventId is a route param - a foreign-org eventId is invisible to RLS here and throws
    // not-found. volunteerId identifies a User row, which is NOT organizationId-scoped (a
    // person's account, not a tenant-owned record) - this lookup only confirms the id exists,
    // it does not and cannot confirm the user actually volunteered for THIS organization. That
    // is a pre-existing characteristic of how volunteers are selected on this page (the
    // dropdown itself queries User by VOLUNTEER role with no organizationId filter either) -
    // named here, not expanded into a UserRoleAssignment-scoped rewrite this stage.
    await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true } });
    await tx.user.findUniqueOrThrow({ where: { id: volunteerId }, select: { id: true } });
    const review = await tx.eventVolunteerReview.upsert({
      create: { ...data, organizationId, createdById: session.user.id, eventId, volunteerId },
      update: data,
      where: { eventId_volunteerId: { eventId, volunteerId } },
    });
    await writeAuditLog(tx, {
      organizationId,
      action: "EVENT_VOLUNTEER_REVIEW_SAVED",
      details: { ...data, volunteerId },
      entityId: review.id,
      entityType: "EventVolunteerReview",
      userId: session.user.id,
    });
  });
  revalidatePath(`/events/${eventId}/debrief`);
}
