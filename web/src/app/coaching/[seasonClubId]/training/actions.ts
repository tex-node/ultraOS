"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoachingClub } from "@/server/coaching/guard";
import { assignPlanToSession, completeTrainingSession } from "@/server/coaching/training";
import { withOrganizationContext } from "@/lib/tenant-context";

// P15 I3 actions. Every one re-checks the club guard (flag, session, club access) - the page's own
// guard is not trusted for a mutation - and writes inside the organization's transaction.

export type TrainingState = { error?: string; saved?: string; completed?: boolean };

const assignSchema = z.object({
  planId: z.string().min(1),
  title: z.string().max(160).optional(),
  occurredAt: z.string().min(1),
  durationMinutes: z.coerce.number().int().min(5).max(240).optional(),
  sessionType: z.enum(["TEAM_PRACTICE", "SKILLS", "STRENGTH", "CONDITIONING", "SHOOTING", "TACTICAL", "RECOVERY"]),
});

export async function assignSession(seasonClubId: string, _state: TrainingState, formData: FormData): Promise<TrainingState> {
  const { scope, userId } = await requireCoachingClub(seasonClubId);
  if (!userId) return { error: "No signed-in user for this action." };

  let input: z.infer<typeof assignSchema>;
  try {
    input = assignSchema.parse({
      planId: formData.get("planId"),
      title: formData.get("title") ?? undefined,
      occurredAt: formData.get("occurredAt"),
      durationMinutes: formData.get("durationMinutes") || undefined,
      sessionType: formData.get("sessionType") ?? "SKILLS",
    });
  } catch (error) {
    return { error: `Check the form: ${error instanceof Error ? error.message : String(error)}` };
  }

  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) return { error: "That date could not be read." };

  const result = await withOrganizationContext(scope.organizationId, (tx) =>
    assignPlanToSession(tx, {
      organizationId: scope.organizationId,
      userId,
      planId: input.planId,
      title: input.title,
      occurredAt,
      durationMinutes: input.durationMinutes,
      sessionType: input.sessionType,
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(`/coaching/${seasonClubId}/training`, "layout");
  return { saved: result.sessionId };
}

const completeSchema = z.object({
  note: z.string().max(500).optional(),
  attendanceStatus: z.enum(["PRESENT", "LATE", "EXCUSED", "ABSENT", "LIMITED"]).optional(),
});

export async function completeSession(seasonClubId: string, sessionId: string, _state: TrainingState, formData: FormData): Promise<TrainingState> {
  const { scope, userId } = await requireCoachingClub(seasonClubId);
  if (!userId) return { error: "No signed-in user for this action." };

  const parsed = completeSchema.safeParse({ note: formData.get("note") ?? undefined, attendanceStatus: formData.get("attendanceStatus") || undefined });
  if (!parsed.success) return { error: "Check the form values." };

  // Metrics come as `metric:<key>` fields; the reviewer types the value the plan targets.
  const metrics: { key: string; numericValue: number }[] = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("metric:")) continue;
    if (typeof value !== "string" || value.trim() === "") continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return { error: `"${value}" is not a number for ${name.slice(7)}.` };
    metrics.push({ key: name.slice(7), numericValue: numeric });
  }

  const result = await withOrganizationContext(scope.organizationId, (tx) =>
    completeTrainingSession(tx, {
      organizationId: scope.organizationId,
      userId,
      sessionId,
      note: parsed.data.note ?? null,
      attendanceStatus: parsed.data.attendanceStatus,
      metrics,
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(`/coaching/${seasonClubId}/training`, "layout");
  return { completed: true };
}
