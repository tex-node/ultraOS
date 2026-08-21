"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

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
  const session = await requirePermission("event:manage");
  const data = {
    actualAttendance: intOrUndefined(value(formData, "actualAttendance")),
    generalNotes: value(formData, "generalNotes") || null,
    weatherConditions: value(formData, "weatherConditions") || null,
    whatToImprove: value(formData, "whatToImprove") || null,
    whatWentWell: value(formData, "whatWentWell") || null,
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.eventDebrief.findUnique({ where: { eventId } });
    const debrief = await tx.eventDebrief.upsert({
      create: { ...data, createdById: session.user.id, eventId },
      update: data,
      where: { eventId },
    });
    await writeAuditLog(tx, {
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
  const session = await requirePermission("event:manage");
  const rating = intOrUndefined(value(formData, "rating"));
  const wouldInviteBackRaw = value(formData, "wouldInviteBack");
  const data = {
    notes: value(formData, "notes") || null,
    rating,
    wouldInviteBack: wouldInviteBackRaw === "" ? null : wouldInviteBackRaw === "true",
  };

  await prisma.$transaction(async (tx) => {
    const review = await tx.eventVendorReview.upsert({
      create: { ...data, createdById: session.user.id, eventId, vendorId },
      update: data,
      where: { eventId_vendorId: { eventId, vendorId } },
    });
    await writeAuditLog(tx, {
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
  const session = await requirePermission("event:manage");
  const data = {
    notes: value(formData, "notes") || null,
    rating: intOrUndefined(value(formData, "rating")),
    roleDescription: value(formData, "roleDescription") || null,
  };

  await prisma.$transaction(async (tx) => {
    const review = await tx.eventVolunteerReview.upsert({
      create: { ...data, createdById: session.user.id, eventId, volunteerId },
      update: data,
      where: { eventId_volunteerId: { eventId, volunteerId } },
    });
    await writeAuditLog(tx, {
      action: "EVENT_VOLUNTEER_REVIEW_SAVED",
      details: { ...data, volunteerId },
      entityId: review.id,
      entityType: "EventVolunteerReview",
      userId: session.user.id,
    });
  });
  revalidatePath(`/events/${eventId}/debrief`);
}
