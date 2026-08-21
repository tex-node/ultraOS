"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization";
import { registerGameVideoFromExistingAsset } from "@/lib/vision/vision-loader";
import type { VideoSourceType } from "@/generated/prisma/enums";

// G.21 Part VI: "register existing MediaAsset" - the workflow this track actually builds. A
// direct large-file upload/presigned-URL flow for video is a real, separate feature (video files
// are typically far larger than this app's other media, and no video exists yet to validate a
// new upload path against) - deliberately deferred, documented in GAME_VIDEO_REGISTRY.md rather
// than built shallow just to check a box.
export async function registerGameVideoAction(fixtureId: string, formData: FormData) {
  const session = await requirePermission("vision:manage");
  const mediaAssetId = String(formData.get("mediaAssetId") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "FULL_GAME") as VideoSourceType;
  const cameraLabel = String(formData.get("cameraLabel") ?? "").trim() || null;
  if (!mediaAssetId) throw new Error("mediaAssetId is required.");

  const gameId = String(formData.get("gameId") ?? "").trim() || null;

  await registerGameVideoFromExistingAsset({
    fixtureId, gameId, mediaAssetId, sourceType, cameraLabel, recordingStartedAt: null, registeredById: session.user.id,
  });
  revalidatePath(`/games/${fixtureId}/video`);
}
