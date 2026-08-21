"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AnnouncementStatus, AnnouncementVisibility, WellWishStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { currentLagosYearMonth } from "@/lib/announcements";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  playerId: z.string().min(1),
  message: z.string().trim().max(500),
  visibility: z.enum(AnnouncementVisibility),
  visibilityClubId: z.string().trim(),
});

export async function createAnnouncement(formData: FormData) {
  const session = await requirePermission("announcement:manage");
  const input = createSchema.parse(formDataToRecord(formData));
  if (input.visibility === "CLUB_FAN_ZONE" && !input.visibilityClubId) {
    throw new Error("A club must be selected for club-scoped visibility.");
  }
  const { year } = currentLagosYearMonth();
  const player = await prisma.player.findUniqueOrThrow({ where: { id: input.playerId } });
  await prisma.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        playerId: player.id,
        celebrationYear: year,
        message: input.message || null,
        visibility: input.visibility,
        visibilityClubId: input.visibility === "CLUB_FAN_ZONE" ? input.visibilityClubId : null,
        createdById: session.user.id,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ANNOUNCEMENT_CREATED",
      entityType: "Announcement",
      entityId: announcement.id,
      details: { playerId: player.id, celebrationYear: year, visibility: announcement.visibility },
    });
  });
  revalidatePath("/announcements");
}

const updateSchema = z.object({
  announcementId: z.string().min(1),
  message: z.string().trim().max(500),
  status: z.enum(AnnouncementStatus),
  visibility: z.enum(AnnouncementVisibility),
  visibilityClubId: z.string().trim(),
});

export async function updateAnnouncement(formData: FormData) {
  const session = await requirePermission("announcement:manage");
  const input = updateSchema.parse(formDataToRecord(formData));
  if (input.visibility === "CLUB_FAN_ZONE" && !input.visibilityClubId) {
    throw new Error("A club must be selected for club-scoped visibility.");
  }
  const existing = await prisma.announcement.findUniqueOrThrow({ where: { id: input.announcementId } });
  await prisma.$transaction(async (tx) => {
    const updated = await tx.announcement.update({
      where: { id: input.announcementId },
      data: {
        message: input.message || null,
        status: input.status,
        visibility: input.visibility,
        visibilityClubId: input.visibility === "CLUB_FAN_ZONE" ? input.visibilityClubId : null,
        publishedAt: input.status === "PUBLISHED" && existing.status !== "PUBLISHED" ? new Date() : existing.publishedAt,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "ANNOUNCEMENT_UPDATED",
      entityType: "Announcement",
      entityId: updated.id,
      details: {
        oldStatus: existing.status,
        newStatus: updated.status,
        oldVisibility: existing.visibility,
        newVisibility: updated.visibility,
        visibilityClubId: updated.visibilityClubId,
      },
    });
  });
  revalidatePath("/announcements");
  revalidatePath("/public/celebrations");
}

const moderateSchema = z.object({
  wellWishId: z.string().min(1),
  decision: z.enum(WellWishStatus),
});

export async function moderateWellWish(formData: FormData) {
  const session = await requirePermission("well-wish:moderate");
  const input = moderateSchema.parse(formDataToRecord(formData));
  if (input.decision === "PENDING") throw new Error("Invalid moderation decision.");
  await prisma.$transaction(async (tx) => {
    const wellWish = await tx.wellWish.update({
      where: { id: input.wellWishId },
      data: { status: input.decision, moderatedById: session.user.id, moderatedAt: new Date() },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "WELL_WISH_MODERATED",
      entityType: "WellWish",
      entityId: wellWish.id,
      details: { decision: input.decision, announcementId: wellWish.announcementId },
    });
  });
  revalidatePath("/announcements");
  revalidatePath("/public/celebrations");
}
