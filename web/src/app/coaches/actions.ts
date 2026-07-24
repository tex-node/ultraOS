"use server";

import { revalidatePath } from "next/cache";
import { StaffRole } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
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
