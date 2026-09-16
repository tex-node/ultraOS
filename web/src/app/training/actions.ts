"use server";

import { revalidatePath } from "next/cache";
import { TrainingAttendanceStatus, TrainingSessionType } from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

// Phase 1 Stage 5.5B: previously ran on requirePermission() alone (no organization) with a bare
// prisma.trainingSession.create() - organizationId silently fell back to the Stage 3a Neon Ultra
// DB default regardless of the acting admin's real organization, and the client-submitted
// seasonId/seasonClubId (simple, non-composite FKs) were never validated as belonging to that
// organization at all. Scoped to the acting admin's own organization; a foreign-org
// seasonId/seasonClubId now fails closed (RLS-invisible) before the create ever runs.
export async function createTrainingSession(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("training:manage");
  const occurredAt = new Date(value(formData, "occurredAt") || Date.now());
  const seasonId = value(formData, "seasonId") || null;
  const seasonClubId = value(formData, "seasonClubId") || null;
  const training = await withOrganizationContext(organizationId, async (tx) => {
    if (seasonId) await tx.season.findUniqueOrThrow({ where: { id: seasonId }, select: { id: true } });
    if (seasonClubId) await tx.seasonClub!.findUniqueOrThrow({ where: { id: seasonClubId }, select: { id: true } });
    return tx.trainingSession.create({
      data: {
        organizationId,
        createdById: session.user.id,
        durationMinutes: Number(value(formData, "durationMinutes")) || null,
        location: value(formData, "location") || null,
        notes: value(formData, "notes") || null,
        occurredAt,
        seasonClubId,
        seasonId,
        sessionType: (value(formData, "sessionType") || TrainingSessionType.TEAM_PRACTICE) as TrainingSessionType,
        title: value(formData, "title"),
      },
    });
  });
  revalidatePath("/training");
  revalidatePath(`/training/${training.id}`);
}

// Phase 1 Stage 5.5B: previously ran on requirePermission() alone (no organization) with a bare
// prisma.athleteTrainingRecord.upsert() - neither the route-derived trainingSessionId nor the
// client-submitted athleteId (both simple, non-composite FKs) were ever validated as belonging
// to the acting admin's organization. Scoped to the acting admin's own organization; a
// foreign-org trainingSessionId or athleteId now fails closed (RLS-invisible) before the upsert.
export async function recordTrainingAttendance(trainingSessionId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("training:record");
  const athleteId = value(formData, "athleteId");
  if (!athleteId) throw new Error("Athlete is required.");
  await withOrganizationContext(organizationId, async (tx) => {
    await tx.trainingSession.findUniqueOrThrow({ where: { id: trainingSessionId }, select: { id: true } });
    await tx.athlete.findUniqueOrThrow({ where: { id: athleteId }, select: { id: true } });
    await tx.athleteTrainingRecord.upsert({
      where: { trainingSessionId_athleteId: { trainingSessionId, athleteId } },
      update: {
        attendanceStatus: (value(formData, "attendanceStatus") || TrainingAttendanceStatus.PRESENT) as TrainingAttendanceStatus,
        developmentFocus: value(formData, "developmentFocus") || null,
        performanceNotes: value(formData, "performanceNotes") || null,
      },
      create: {
        organizationId,
        athleteId,
        attendanceStatus: (value(formData, "attendanceStatus") || TrainingAttendanceStatus.PRESENT) as TrainingAttendanceStatus,
        createdById: session.user.id,
        developmentFocus: value(formData, "developmentFocus") || null,
        performanceNotes: value(formData, "performanceNotes") || null,
        trainingSessionId,
      },
    });
  });
  revalidatePath(`/training/${trainingSessionId}`);
}
