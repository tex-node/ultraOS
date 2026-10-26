"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import {
  createTimelineAnchor, acceptTimelineAnchor, reviewObservation, reviewEventMatch,
  ensureVisionModel, createAnalysisRun,
} from "@/lib/vision/vision-loader";
import { createHighlightForObservation } from "@/lib/vision/vision-loader";
import type { VisionObservationStatus } from "@/generated/prisma/enums";

export async function createAnchorAction(fixtureId: string, gameVideoId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  await createTimelineAnchor(organizationId, {
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
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  await acceptTimelineAnchor(organizationId, anchorId, session.user.id);
  revalidatePath(`/vision/games/${fixtureId}`);
}

export async function reviewObservationAction(fixtureId: string, observationId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  const action = String(formData.get("action")) as VisionObservationStatus;
  const reason = String(formData.get("reason") ?? "") || undefined;
  await reviewObservation(organizationId, observationId, action, session.user.id, reason);

  // A confirmation is worth watching (streak v15, Prompt 4): cut the ten seconds around it into a highlight clip. This
  // runs AFTER the confirmation commits, because an ffmpeg subprocess must not hold a database transaction - and a
  // failed cut must never undo a reviewer's decision. The outcome is surfaced below rather than swallowed.
  let highlight: { ok: boolean; mediaAssetId?: string; reason?: string } | null = null;
  if (action === "CONFIRMED") {
    highlight = await createHighlightForObservation(organizationId, observationId, session.user.id);
    if (!highlight.ok) console.warn(`highlight clip not created for ${observationId}: ${highlight.reason}`);
  }
  revalidatePath(`/vision/games/${fixtureId}`);
  revalidatePath("/public/fixtures/[id]", "page");
}

export async function reviewEventMatchAction(fixtureId: string, matchId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  const action = String(formData.get("action")) as VisionObservationStatus;
  const reason = String(formData.get("reason") ?? "") || undefined;
  await reviewEventMatch(organizationId, matchId, action, session.user.id, reason);
  revalidatePath(`/vision/games/${fixtureId}`);
}

// Part XIV/XLIX: this only QUEUES a run - see scripts/vision-analyze.ts for why actual inference
// never happens inside this web request (Part L/LXXIII).
export async function queueAnalysisRunAction(fixtureId: string, gameVideoId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  const modelKey = String(formData.get("modelKey") ?? "PLAYER_DETECTOR_V1");
  const model = await ensureVisionModel(organizationId, modelKey, "0.1.0-poc", "G.21 offline proof-of-concept player/person detector");
  await createAnalysisRun(organizationId, { gameVideoId, visionModelId: model.id, requestedById: session.user.id });
  revalidatePath(`/vision/games/${fixtureId}`);
}
