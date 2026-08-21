"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization";
import {
  createTimelineAnchor, acceptTimelineAnchor, reviewObservation, reviewEventMatch,
  ensureVisionModel, createAnalysisRun,
} from "@/lib/vision/vision-loader";
import type { VisionObservationStatus } from "@/generated/prisma/enums";

export async function createAnchorAction(fixtureId: string, gameVideoId: string, formData: FormData) {
  const session = await requirePermission("vision:manage");
  await createTimelineAnchor({
    gameVideoId,
    videoTimeMs: Number(formData.get("videoTimeMs")),
    period: Number(formData.get("period")),
    gameClockSeconds: Number(formData.get("gameClockSeconds")),
    source: "MANUAL",
    confidence: null,
    createdById: session.user.id,
  });
  revalidatePath(`/vision/games/${fixtureId}`);
}

export async function acceptAnchorAction(fixtureId: string, anchorId: string) {
  const session = await requirePermission("vision:manage");
  await acceptTimelineAnchor(anchorId, session.user.id);
  revalidatePath(`/vision/games/${fixtureId}`);
}

export async function reviewObservationAction(fixtureId: string, observationId: string, formData: FormData) {
  const session = await requirePermission("vision:manage");
  const action = String(formData.get("action")) as VisionObservationStatus;
  const reason = String(formData.get("reason") ?? "") || undefined;
  await reviewObservation(observationId, action, session.user.id, reason);
  revalidatePath(`/vision/games/${fixtureId}`);
}

export async function reviewEventMatchAction(fixtureId: string, matchId: string, formData: FormData) {
  const session = await requirePermission("vision:manage");
  const action = String(formData.get("action")) as VisionObservationStatus;
  const reason = String(formData.get("reason") ?? "") || undefined;
  await reviewEventMatch(matchId, action, session.user.id, reason);
  revalidatePath(`/vision/games/${fixtureId}`);
}

// Part XIV/XLIX: this only QUEUES a run - see scripts/vision-analyze.ts for why actual inference
// never happens inside this web request (Part L/LXXIII).
export async function queueAnalysisRunAction(fixtureId: string, gameVideoId: string, formData: FormData) {
  const session = await requirePermission("vision:manage");
  const modelKey = String(formData.get("modelKey") ?? "PLAYER_DETECTOR_V1");
  const model = await ensureVisionModel(modelKey, "0.1.0-poc", "G.21 offline proof-of-concept player/person detector");
  await createAnalysisRun({ gameVideoId, visionModelId: model.id, requestedById: session.user.id });
  revalidatePath(`/vision/games/${fixtureId}`);
}
