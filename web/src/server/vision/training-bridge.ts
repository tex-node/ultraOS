import type { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

// Vision -> Training bridge (streak v13, Prompt 2).
//
// The honest part of this file is the mapping. The detector we installed detects PEOPLE, not jump shots, so the only
// metric it can support today is a coverage metric: how many frames of this clip contained a detected athlete. A
// `vision_jump_shots` metric is defined and wired too, but it reads SHOT_ATTEMPT_CANDIDATE observations, which
// nothing produces yet - so it writes nothing and says why. Inventing a shot count from person boxes would be the
// same lie as a stub that reports detections it did not make.
export const VISION_METRICS = {
  athleteFrames: {
    key: "vision_athlete_frames",
    name: "Athlete frames detected",
    unit: "frames",
    source: "PERSON_DETECTED" as const,
    description: "Frames of the linked clip in which the detector found an athlete.",
  },
  shotsDetected: {
    key: "vision_shots_detected",
    name: "Jump shots detected",
    unit: "shots",
    source: "SHOT_ATTEMPT_CANDIDATE" as const,
    description: "Shot-attempt candidates the detector produced. Requires a shot classifier; none exists yet.",
  },
} as const;

export type VisionBridgeResult = {
  linked: boolean;
  runId: string | null;
  observations: number;
  written: { metricKey: string; value: number; athletes: number }[];
  skipped: { metricKey: string; reason: string }[];
};

/** Attach a clip to a session (both must be in the same organization). */
export async function linkVideoToSession(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; gameVideoId: string; trainingSessionId: string },
): Promise<boolean> {
  const session = await tx.trainingSession.findFirst({ where: { id: args.trainingSessionId, organizationId: args.organizationId }, select: { id: true } });
  if (!session) return false;
  const updated = await tx.gameVideo.updateMany({
    where: { id: args.gameVideoId, organizationId: args.organizationId },
    data: { trainingSessionId: args.trainingSessionId },
  });
  return updated.count === 1;
}

/**
 * Turn a completed analysis into session metrics.
 *
 * Idempotent by construction: the metric rows are unique on (athleteTrainingRecordId, metricDefinitionId), so a second
 * run updates the value rather than adding a duplicate - re-analysing a clip is normal and must not inflate a total.
 */
export async function syncTrainingMetricsFromVision(
  prisma: Prisma.TransactionClient,
  args: { organizationId: string; gameVideoId: string },
): Promise<VisionBridgeResult> {
  const video = await prisma.gameVideo.findFirst({
    where: { id: args.gameVideoId, organizationId: args.organizationId },
    select: { id: true, trainingSessionId: true },
  });
  if (!video?.trainingSessionId) {
    return { linked: false, runId: null, observations: 0, written: [], skipped: [{ metricKey: "all", reason: "the clip is not linked to a training session" }] };
  }

  const run = await prisma.visionAnalysisRun.findFirst({
    where: { gameVideoId: video.id, organizationId: args.organizationId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: { id: true, observationCount: true },
  });
  if (!run) {
    return { linked: true, runId: null, observations: 0, written: [], skipped: [{ metricKey: "all", reason: "no completed analysis run for this clip" }] };
  }

  const counts = await prisma.visionObservation.groupBy({
    by: ["observationType"],
    where: { analysisRunId: run.id, organizationId: args.organizationId },
    _count: { observationType: true },
  });
  const byType = new Map(counts.map((entry) => [entry.observationType, entry._count.observationType]));

  const participants = await prisma.athleteTrainingRecord.findMany({
    where: { trainingSessionId: video.trainingSessionId, organizationId: args.organizationId },
    select: { id: true, athleteId: true },
  });
  if (participants.length === 0) {
    return { linked: true, runId: run.id, observations: run.observationCount, written: [], skipped: [{ metricKey: "all", reason: "the session has no participants to attach a metric to" }] };
  }

  const written: VisionBridgeResult["written"] = [];
  const skipped: VisionBridgeResult["skipped"] = [];
  for (const metric of Object.values(VISION_METRICS)) {
    const value = byType.get(metric.source) ?? 0;
    if (value === 0) {
      skipped.push({
        metricKey: metric.key,
        reason:
          metric.source === "SHOT_ATTEMPT_CANDIDATE"
            ? "no shot classifier exists yet, so no shot candidates were produced by the detector"
            : "the completed run contains no observations of that type",
      });
      continue;
    }
    const definition = await prisma.trainingMetricDefinition.upsert({
      where: { key: metric.key },
      create: { key: metric.key, name: metric.name, unit: metric.unit, valueType: "NUMERIC" },
      update: { name: metric.name, unit: metric.unit },
      select: { id: true },
    });
    for (const participant of participants) {
      await prisma.athleteTrainingMetric.upsert({
        where: { athleteTrainingRecordId_metricDefinitionId: { athleteTrainingRecordId: participant.id, metricDefinitionId: definition.id } },
        create: {
          organizationId: args.organizationId,
          athleteTrainingRecordId: participant.id,
          metricDefinitionId: definition.id,
          numericValue: value,
        },
        update: { numericValue: value },
      });
    }
    written.push({ metricKey: metric.key, value, athletes: participants.length });
  }

  return { linked: true, runId: run.id, observations: run.observationCount, written, skipped };
}

/** What the session page shows: the vision metrics attached to this session, with their source. */
export async function loadVisionMetricsForSession(
  prisma: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  trainingSessionId: string,
): Promise<{ metricKey: string; name: string; unit: string | null; value: number; athleteCount: number }[]> {
  const videos = await prisma.gameVideo.findMany({
    where: { organizationId, trainingSessionId },
    select: { id: true },
  });
  if (videos.length === 0) return [];
  const rows = await prisma.athleteTrainingMetric.findMany({
    where: {
      organizationId,
      athleteTrainingRecord: { trainingSessionId },
      metricDefinition: { key: { in: Object.values(VISION_METRICS).map((metric) => metric.key) } },
    },
    select: { numericValue: true, metricDefinition: { select: { key: true, name: true, unit: true } } },
  });
  const grouped = new Map<string, { name: string; unit: string | null; value: number; athleteCount: number }>();
  for (const row of rows) {
    const key = row.metricDefinition.key;
    const existing = grouped.get(key);
    const value = Number(row.numericValue ?? 0);
    if (existing) {
      existing.athleteCount += 1;
      existing.value = Math.max(existing.value, value);
    } else {
      grouped.set(key, { name: row.metricDefinition.name, unit: row.metricDefinition.unit, value, athleteCount: 1 });
    }
  }
  return [...grouped.entries()].map(([metricKey, entry]) => ({ metricKey, ...entry }));
}
