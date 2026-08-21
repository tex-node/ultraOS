"use server";

import { revalidatePath } from "next/cache";
import { ApplicationType, CoachSeasonZeroDivision, CoachSeasonZeroSelectionStatus, MediaAssetPurpose, StaffRole } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { assignPrimaryMediaAsset, uploadMediaAsset, validateImageFile } from "@/lib/media-storage";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

export async function markSeasonZeroCoachSelection(applicationId: string, formData: FormData) {
  const session = await requirePermission("staff:manage");
  const status = value(formData, "status") as CoachSeasonZeroSelectionStatus;
  const divisionInput = value(formData, "division");
  const reason = value(formData, "reason");
  if (!Object.values(CoachSeasonZeroSelectionStatus).includes(status)) {
    throw new Error("Invalid Season Zero coach selection status.");
  }
  let division: CoachSeasonZeroDivision | null = null;
  if (status === CoachSeasonZeroSelectionStatus.SEASON_ZERO_SELECTED) {
    if (!Object.values(CoachSeasonZeroDivision).includes(divisionInput as CoachSeasonZeroDivision)) {
      throw new Error("An explicit MEN or WOMEN draft division is required to select a coach for Season Zero.");
    }
    division = divisionInput as CoachSeasonZeroDivision;
  }

  await prisma.$transaction(async (tx) => {
    const application = await tx.application.findUniqueOrThrow({
      select: { coachSeasonZeroDivision: true, coachSeasonZeroSelectionStatus: true, id: true, status: true, type: true },
      where: { id: applicationId },
    });
    if (application.type !== ApplicationType.COACH) {
      throw new Error("Only coach applications can be marked for Season Zero selection.");
    }
    await tx.application.update({
      data: { coachSeasonZeroDivision: division, coachSeasonZeroSelectionStatus: status },
      where: { id: applicationId },
    });
    await writeAuditLog(tx, {
      action: "COACH_SEASON_ZERO_SELECTION_MARKED",
      details: {
        applicationId,
        applicationStatus: application.status,
        changedAt: new Date().toISOString(),
        newDivision: division,
        newStatus: status,
        oldDivision: application.coachSeasonZeroDivision,
        oldStatus: application.coachSeasonZeroSelectionStatus,
        reason: reason || null,
      },
      entityId: applicationId,
      entityType: "Application",
      userId: session.user.id,
    });
  });

  revalidatePath("/coaches/season-zero-selection");
}

export async function assignSeasonClubCoach(formData: FormData) {
  const session = await requirePermission("staff:manage");
  const seasonClubId = value(formData, "seasonClubId");
  const staffId = value(formData, "staffId");
  const assignmentType = value(formData, "assignmentType");

  if (!seasonClubId || !staffId || !["head", "assistant"].includes(assignmentType)) {
    throw new Error("SeasonClub, coach, and assignment type are required.");
  }

  await prisma.$transaction(async (tx) => {
    const [seasonClub, staff] = await Promise.all([
      tx.seasonClub.findUniqueOrThrow({
        select: { divisionId: true, id: true, seasonId: true },
        where: { id: seasonClubId },
      }),
      tx.staff.findUniqueOrThrow({
        select: { id: true, name: true, role: true },
        where: { id: staffId },
      }),
    ]);

    const coachRoles: StaffRole[] = [StaffRole.HEAD_COACH, StaffRole.ASSISTANT_COACH];
    if (!coachRoles.includes(staff.role)) {
      throw new Error("Selected staff member is not a coach.");
    }

    const competingAssignment = await tx.seasonClub.findFirst({
      select: { id: true },
      where: {
        id: { not: seasonClub.id },
        OR: [{ headCoachId: staff.id }, { assistantCoachId: staff.id }],
        divisionId: seasonClub.divisionId,
        seasonId: seasonClub.seasonId,
      },
    });
    if (competingAssignment) {
      throw new Error("Coach is already assigned in this season/division.");
    }

    await tx.seasonClub.update({
      data: assignmentType === "head" ? { headCoachId: staff.id } : { assistantCoachId: staff.id },
      where: { id: seasonClub.id },
    });
    await writeAuditLog(tx, {
      action: "SEASON_CLUB_COACH_ASSIGNED",
      details: { assignmentType, seasonClubId, staffId, staffName: staff.name },
      entityId: seasonClub.id,
      entityType: "SeasonClub",
      userId: session.user.id,
    });
  });

  revalidatePath("/coaches");
  revalidatePath("/coaches/assignments");
}

export async function clearSeasonClubCoach(formData: FormData) {
  const session = await requirePermission("staff:manage");
  const seasonClubId = value(formData, "seasonClubId");
  const assignmentType = value(formData, "assignmentType");

  if (!seasonClubId || !["head", "assistant"].includes(assignmentType)) {
    throw new Error("SeasonClub and assignment type are required.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.seasonClub.update({
      data: assignmentType === "head" ? { headCoachId: null } : { assistantCoachId: null },
      where: { id: seasonClubId },
    });
    await writeAuditLog(tx, {
      action: "SEASON_CLUB_COACH_CLEARED",
      details: { assignmentType, seasonClubId },
      entityId: seasonClubId,
      entityType: "SeasonClub",
      userId: session.user.id,
    });
  });

  revalidatePath("/coaches");
  revalidatePath("/coaches/assignments");
}

const COACH_PHOTO_FILENAME_PATTERN = /^(UBS-\d{6})\.(jpe?g|png|webp)$/i;

export type CoachPhotoImportState = {
  preview?: {
    filesScanned: number;
    matchedStaff: string[];
    unmatchedFiles: string[];
    duplicateStaffIds: string[];
    invalidFiles: Array<{ fileName: string; reason: string }>;
    existingPhotoConflicts: string[];
    safeNewPhotos: string[];
    safeReplacements: string[];
  };
  apply?: {
    applied: string[];
    skippedConflicts: string[];
    skippedInvalid: string[];
    skippedUnmatched: string[];
  };
  error?: string;
};

async function readCoachPhotoFiles(formData: FormData) {
  const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
  const seen = new Map<string, number>();
  const rows = await Promise.all(files.map(async (file) => {
    const match = file.name.match(COACH_PHOTO_FILENAME_PATTERN);
    if (!match) return { file, ultraStaffId: null as string | null, error: "Filename must match UBS-000001.jpg, .png, or .webp." };
    const ultraStaffId = match[1].toUpperCase();
    seen.set(ultraStaffId, (seen.get(ultraStaffId) ?? 0) + 1);
    try {
      await validateImageFile(file, MediaAssetPurpose.COACH_PROFILE_PHOTO);
      return { file, ultraStaffId, error: null as string | null };
    } catch (error) {
      return { file, ultraStaffId, error: error instanceof Error ? error.message : "Invalid image file." };
    }
  }));
  const duplicateStaffIds = new Set([...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  return { rows, duplicateStaffIds };
}

export async function previewCoachPhotoImport(
  _state: CoachPhotoImportState,
  formData: FormData,
): Promise<CoachPhotoImportState> {
  await requirePermission("media:upload");
  const { rows, duplicateStaffIds } = await readCoachPhotoFiles(formData);
  if (rows.length === 0) return { error: "Upload at least one JPG, PNG, or WebP file named like UBS-000001.jpg." };

  const ultraStaffIds = rows.map((row) => row.ultraStaffId).filter((id): id is string => Boolean(id));
  const staff = await prisma.staff.findMany({
    where: { ultraStaffId: { in: ultraStaffIds } },
    select: { ultraStaffId: true, photoUrl: true },
  });
  const staffMap = new Map(staff.map((entry) => [entry.ultraStaffId as string, entry]));

  const matchedStaff: string[] = [];
  const unmatchedFiles: string[] = [];
  const duplicateStaffIdsOut: string[] = [];
  const invalidFiles: Array<{ fileName: string; reason: string }> = [];
  const existingPhotoConflicts: string[] = [];
  const safeNewPhotos: string[] = [];
  const safeReplacements: string[] = [];

  for (const row of rows) {
    if (!row.ultraStaffId) {
      invalidFiles.push({ fileName: row.file.name, reason: row.error ?? "Invalid filename." });
      continue;
    }
    if (row.error) {
      invalidFiles.push({ fileName: row.file.name, reason: row.error });
      continue;
    }
    if (duplicateStaffIds.has(row.ultraStaffId)) {
      duplicateStaffIdsOut.push(row.ultraStaffId);
      continue;
    }
    const entry = staffMap.get(row.ultraStaffId);
    if (!entry) {
      unmatchedFiles.push(row.file.name);
      continue;
    }
    matchedStaff.push(row.ultraStaffId);
    if (entry.photoUrl) {
      existingPhotoConflicts.push(row.ultraStaffId);
      safeReplacements.push(row.ultraStaffId);
    } else {
      safeNewPhotos.push(row.ultraStaffId);
    }
  }

  return {
    preview: {
      filesScanned: rows.length,
      matchedStaff,
      unmatchedFiles,
      duplicateStaffIds: [...new Set(duplicateStaffIdsOut)],
      invalidFiles,
      existingPhotoConflicts,
      safeNewPhotos,
      safeReplacements,
    },
  };
}

export async function applyCoachPhotoImport(
  _state: CoachPhotoImportState,
  formData: FormData,
): Promise<CoachPhotoImportState> {
  const session = await requirePermission("media:upload");
  const allowReplacements = formData.get("allowReplacements") === "on";
  const { rows, duplicateStaffIds } = await readCoachPhotoFiles(formData);
  if (rows.length === 0) return { error: "Upload at least one JPG, PNG, or WebP file named like UBS-000001.jpg." };

  const ultraStaffIds = rows.map((row) => row.ultraStaffId).filter((id): id is string => Boolean(id));
  const staff = await prisma.staff.findMany({
    where: { ultraStaffId: { in: ultraStaffIds } },
    select: { id: true, ultraStaffId: true, photoUrl: true },
  });
  const staffMap = new Map(staff.map((entry) => [entry.ultraStaffId as string, entry]));

  const applied: string[] = [];
  const skippedConflicts: string[] = [];
  const skippedInvalid: string[] = [];
  const skippedUnmatched: string[] = [];

  for (const row of rows) {
    if (!row.ultraStaffId || row.error || duplicateStaffIds.has(row.ultraStaffId ?? "")) {
      skippedInvalid.push(row.file.name);
      continue;
    }
    const entry = staffMap.get(row.ultraStaffId);
    if (!entry) {
      skippedUnmatched.push(row.ultraStaffId);
      continue;
    }
    if (entry.photoUrl && !allowReplacements) {
      skippedConflicts.push(row.ultraStaffId);
      continue;
    }
    const asset = await uploadMediaAsset({
      file: row.file,
      purpose: MediaAssetPurpose.COACH_PROFILE_PHOTO,
      title: `Coach photo bulk import (${row.ultraStaffId})`,
      uploadedById: session.user.id,
    });
    await assignPrimaryMediaAsset({ entityId: entry.id, entityType: "Staff", purpose: MediaAssetPurpose.COACH_PROFILE_PHOTO }, asset.id, session.user.id);
    applied.push(row.ultraStaffId);
  }

  revalidatePath("/coaches/photos/import");
  revalidatePath("/coaches");
  revalidatePath("/draft-readiness");

  return { apply: { applied, skippedConflicts, skippedInvalid, skippedUnmatched } };
}
