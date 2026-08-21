"use server";

import { revalidatePath } from "next/cache";
import { TrainingAttendanceStatus, TrainingSessionType } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field.trim() : "";
}

export async function createTrainingSession(formData: FormData) {
  const session = await requirePermission("training:manage");
  const occurredAt = new Date(value(formData, "occurredAt") || Date.now());
  const training = await prisma.trainingSession.create({
    data: {
      createdById: session.user.id,
      durationMinutes: Number(value(formData, "durationMinutes")) || null,
      location: value(formData, "location") || null,
      notes: value(formData, "notes") || null,
      occurredAt,
      seasonClubId: value(formData, "seasonClubId") || null,
      seasonId: value(formData, "seasonId") || null,
      sessionType: (value(formData, "sessionType") || TrainingSessionType.TEAM_PRACTICE) as TrainingSessionType,
      title: value(formData, "title"),
    },
  });
  revalidatePath("/training");
  revalidatePath(`/training/${training.id}`);
}

export async function recordTrainingAttendance(trainingSessionId: string, formData: FormData) {
  const session = await requirePermission("training:record");
  const athleteId = value(formData, "athleteId");
  if (!athleteId) throw new Error("Athlete is required.");
  await prisma.athleteTrainingRecord.upsert({
    where: { trainingSessionId_athleteId: { trainingSessionId, athleteId } },
    update: {
      attendanceStatus: (value(formData, "attendanceStatus") || TrainingAttendanceStatus.PRESENT) as TrainingAttendanceStatus,
      developmentFocus: value(formData, "developmentFocus") || null,
      performanceNotes: value(formData, "performanceNotes") || null,
    },
    create: {
      athleteId,
      attendanceStatus: (value(formData, "attendanceStatus") || TrainingAttendanceStatus.PRESENT) as TrainingAttendanceStatus,
      createdById: session.user.id,
      developmentFocus: value(formData, "developmentFocus") || null,
      performanceNotes: value(formData, "performanceNotes") || null,
      trainingSessionId,
    },
  });
  revalidatePath(`/training/${trainingSessionId}`);
}
