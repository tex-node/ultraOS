"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import {
  createDraftCourtSpecification, updateDraftCourtSpecification, markCourtSpecificationOfficial,
  setGameAttackingDirection,
} from "@/lib/vision/vision-loader";
import type { CourtBasketSide } from "@/generated/prisma/enums";

export async function createDraftCourtSpecAction(formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  const venueId = String(formData.get("venueId") ?? "");
  const effectiveSeasonId = String(formData.get("effectiveSeasonId") ?? "") || null;
  if (!venueId) throw new Error("venueId is required.");
  await createDraftCourtSpecification(organizationId, { venueId, effectiveSeasonId, createdById: session.user.id });
  revalidatePath("/vision/videos");
}

export async function updateDraftCourtSpecAction(id: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  const num = (key: string) => {
    const v = formData.get(key);
    if (v === null || v === "") return undefined;
    return Number(v);
  };
  await updateDraftCourtSpecification(organizationId, id, {
    courtLengthUnits: num("courtLengthUnits") ?? null,
    courtWidthUnits: num("courtWidthUnits") ?? null,
    halfCourtX: num("halfCourtX") ?? null,
    basketACourtX: num("basketACourtX") ?? null,
    basketACourtY: num("basketACourtY") ?? null,
    basketBCourtX: num("basketBCourtX") ?? null,
    basketBCourtY: num("basketBCourtY") ?? null,
    originDescription: String(formData.get("originDescription") ?? "") || null,
    units: String(formData.get("units") ?? "meters"),
  }, session.user.id);
  revalidatePath("/vision/videos");
}

export async function markCourtSpecOfficialAction(id: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  await markCourtSpecificationOfficial(organizationId, id, session.user.id);
  revalidatePath("/vision/videos");
}

export async function setAttackingDirectionAction(gameId: string, formData: FormData) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");
  const side = String(formData.get("homeAttacksBasketFirstHalf")) as CourtBasketSide;
  await setGameAttackingDirection(organizationId, gameId, side, session.user.id);
  revalidatePath("/vision/videos");
}


// Start or retry analysis for a registered video.
//
// The upload path fires the same request once and then forgets it. Anything that goes wrong there - worker restarting, a timeout, a
// redeploy mid-upload - leaves the video at READY_FOR_ANALYSIS forever, because nothing retries and nothing in the UI can ask. This is
// that ask. Failures are returned to the caller, not swallowed: an operator who clicks "Analyse" and sees nothing happen will conclude
// the feature is broken, which is what happened.
export async function startVisionAnalysisAction(gameVideoId: string) {
  const { session, organizationId } = await requirePermissionWithOrganization("vision:manage");

  const worker = (process.env.VISION_WORKER_URL ?? "http://127.0.0.1:8010").replace(/\/$/, "");
  const token = process.env.VISION_WORKER_TOKEN ?? "";

  try {
    const response = await fetch(`${worker}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        game_video_id: gameVideoId,
        organization_id: organizationId,
        requested_by_id: session.user.id,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      return { ok: false as const, error: `worker refused the request (${response.status}): ${detail}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return { ok: false as const, error: `cannot reach the vision worker: ${message}` };
  }

  revalidatePath("/vision/videos");
  return { ok: true as const };
}
