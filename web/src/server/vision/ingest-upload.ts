import "server-only";

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mediaLocalRoot } from "@/lib/media-storage";
import { withOrganizationContext } from "@/lib/tenant-context";
import { writeAuditLog } from "@/lib/audit";

// Browser video upload for the vision pipeline (streak v8, Prompt 2).
//
// `scripts/vision-ingest.ts` was the only way in, which meant SSH access to ingest footage. This is the same
// pipeline behind a form: validate -> probe -> store -> MediaAsset + GameVideo -> POST /analyze. The script is
// untouched, so a host without a browser workflow keeps working.
//
// Two deliberate choices:
//   - a file that cannot be PROBED is refused rather than registered with null dimensions. A GameVideo whose
//     duration and resolution are unknown cannot be aligned to anything, and a row that looks ingested but is
//     unusable is worse than a clear error;
//   - the analysis POST is best-effort. If the worker is down, the row is READY_FOR_ANALYSIS and the beat
//     poller collects it within 5 minutes - the upload still succeeds and says so.

const MAX_BYTES = 500 * 1024 * 1024;
const FFPROBE = process.env.FFPROBE_BINARY ?? "ffprobe";
const WORKER = process.env.VISION_WORKER_URL ?? "http://127.0.0.1:8010";
const WORKER_TOKEN = process.env.VISION_WORKER_TOKEN ?? "";

export type VideoProbe = { durationSeconds: number | null; width: number | null; height: number | null; frameRate: number | null };

export type VideoUploadResult =
  | { ok: true; gameVideoId: string; mediaAssetId: string; duplicate: boolean; queued: boolean; runId?: string; warning?: string }
  | { ok: false; error: string };

export function probeVideo(path: string): VideoProbe {
  const result = spawnSync(
    FFPROBE,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate:format=duration", "-of", "default=noprint_wrappers=1", path],
    { encoding: "utf8" },
  );
  if (result.error) throw new Error(`ffprobe is not available (${result.error.message}); install ffmpeg or set FFPROBE_BINARY`);
  if (result.status !== 0) throw new Error(`ffprobe could not read the file: ${(result.stderr ?? "").trim().slice(0, 200) || "unknown error"}`);
  const values = new Map<string, string>();
  for (const line of (result.stdout ?? "").split("\n")) {
    const index = line.indexOf("=");
    if (index > 0) values.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
  }
  const [numerator, denominator] = (values.get("avg_frame_rate") ?? "").split("/");
  const frameRate = numerator && denominator && Number(denominator) !== 0 ? Number(numerator) / Number(denominator) : null;
  const duration = Number(values.get("duration"));
  return {
    durationSeconds: Number.isFinite(duration) ? Math.round(duration) : null,
    width: values.get("width") ? Number(values.get("width")) : null,
    height: values.get("height") ? Number(values.get("height")) : null,
    frameRate: frameRate !== null && Number.isFinite(frameRate) ? Math.round(frameRate * 100) / 100 : null,
  };
}

export async function ingestUploadedVideo(args: {
  organizationId: string;
  userId: string;
  fixtureId: string;
  file: File;
  cameraLabel?: string;
  sourceType?: "PHONE_RECORDING" | "FULL_GAME" | "CAMERA_ISO" | "BROADCAST_PROGRAM";
}): Promise<VideoUploadResult> {
  const { organizationId, userId, fixtureId, file } = args;
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > MAX_BYTES) return { ok: false, error: `That video is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` };
  const looksLikeVideo = /\.(mp4|m4v|mov)$/i.test(file.name) || file.type.startsWith("video/");
  if (!looksLikeVideo) return { ok: false, error: "That is not a video file (expected .mp4/.mov)." };

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const fixture = await withOrganizationContext(organizationId, (tx) =>
    tx.fixture.findFirst({
      where: { id: fixtureId, organizationId },
      select: { id: true, scheduledAt: true, homeSeasonClub: { select: { club: { select: { name: true } } } }, awaySeasonClub: { select: { club: { select: { name: true } } } }, homeEntrant: { select: { name: true } }, awayEntrant: { select: { name: true } } },
    }),
  );
  if (!fixture) return { ok: false, error: "That fixture does not exist in this organization." };

  const existing = await withOrganizationContext(organizationId, (tx) =>
    tx.gameVideo.findFirst({ where: { organizationId, fixtureId, mediaAsset: { checksumSha256: sha256 } }, select: { id: true, mediaAssetId: true } }),
  );
  if (existing) return { ok: true, gameVideoId: existing.id, mediaAssetId: existing.mediaAssetId, duplicate: true, queued: false };

  const tempPath = join(tmpdir(), `vision-upload-${sha256.slice(0, 12)}-${basename(file.name).replace(/[^\w.\-]/g, "_")}`);
  writeFileSync(tempPath, bytes);
  let probe: VideoProbe;
  try {
    probe = probeVideo(tempPath);
  } catch (error) {
    unlinkSync(tempPath);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (probe.durationSeconds === null || probe.width === null) {
    unlinkSync(tempPath);
    return { ok: false, error: "The file has no readable video stream, so it cannot be registered." };
  }

  const objectKey = join("vision", organizationId, `${sha256}.mp4`);
  const storedPath = join(mediaLocalRoot(), objectKey);
  try {
    mkdirSync(join(mediaLocalRoot(), "vision", organizationId), { recursive: true });
    copyFileSync(tempPath, storedPath);
  } catch (error) {
    unlinkSync(tempPath);
    return { ok: false, error: `The file could not be stored: ${error instanceof Error ? error.message : String(error)}` };
  }
  unlinkSync(tempPath);

  const created = await withOrganizationContext(organizationId, async (tx) => {
    const asset = await tx.mediaAsset.create({
      data: {
        organizationId,
        storageProvider: "LOCAL_PERSISTENT_STORAGE",
        objectKey,
        originalFilename: file.name.replace(/[^\w.\- ]/g, "").slice(0, 180) || null,
        mimeType: "video/mp4",
        byteSize: bytes.byteLength,
        width: probe.width,
        height: probe.height,
        checksumSha256: sha256,
        purpose: "GAME_VIDEO",
        title: `${fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "Home"} vs ${fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "Away"} - ${args.cameraLabel ?? "Camera 1"}`,
        source: "vision/upload",
        uploadedById: userId,
      },
      select: { id: true },
    });
    const video = await tx.gameVideo.create({
      data: {
        organizationId,
        fixtureId,
        mediaAssetId: asset.id,
        sourceType: args.sourceType ?? "PHONE_RECORDING",
        durationSeconds: probe.durationSeconds,
        frameRate: probe.frameRate,
        resolutionWidth: probe.width,
        resolutionHeight: probe.height,
        recordingStartedAt: fixture.scheduledAt,
        cameraLabel: args.cameraLabel ?? "Camera 1",
        registeredById: userId,
        analysisEligible: true,
        visionCapability: "VIDEO_REGISTERED",
        ingestStatus: "READY_FOR_ANALYSIS",
      },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      organizationId,
      userId,
      action: "GAME_VIDEO_INGESTED",
      entityType: "GameVideo",
      entityId: video.id,
      details: { fixtureId, mediaAssetId: asset.id, sha256, probe, via: "browser-upload", objectKey },
    } as Prisma.AuditLogUncheckedCreateInput extends never ? never : Parameters<typeof writeAuditLog>[1]);
    return { assetId: asset.id, videoId: video.id };
  });

  // Best effort: the row is the durable state; the poller is the safety net.
  let queued = false;
  let runId: string | undefined;
  let warning: string | undefined;
  try {
    const response = await fetch(`${WORKER.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(WORKER_TOKEN ? { authorization: `Bearer ${WORKER_TOKEN}` } : {}) },
      body: JSON.stringify({ game_video_id: created.videoId, organization_id: organizationId, requested_by_id: userId }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const payload = (await response.json()) as { run_id?: string; status?: string };
      queued = true;
      runId = payload.run_id;
    } else {
      warning = `The vision worker answered ${response.status}; the video is queued for the poller instead.`;
    }
  } catch (error) {
    warning = `The vision worker is not reachable (${error instanceof Error ? error.message : String(error)}); the video is queued for the poller instead.`;
  }

  return { ok: true, gameVideoId: created.videoId, mediaAssetId: created.assetId, duplicate: false, queued, runId, warning };
}

/** Used by the verification script: remove a video that an upload test created. */
export async function deleteUploadedVideo(organizationId: string, gameVideoId: string): Promise<void> {
  await withOrganizationContext(organizationId, async (tx) => {
    const video = await tx.gameVideo.findFirst({ where: { id: gameVideoId, organizationId }, select: { mediaAsset: { select: { id: true, objectKey: true } } } });
    if (!video) return;
    await tx.visionObservation.deleteMany({ where: { gameVideoId } });
    await tx.visionAnalysisRun.deleteMany({ where: { gameVideoId } });
    await tx.gameVideo.delete({ where: { id: gameVideoId } });
    await tx.mediaAsset.delete({ where: { id: video.mediaAsset.id } });
    try {
      unlinkSync(join(mediaLocalRoot(), video.mediaAsset.objectKey));
    } catch {
      /* the row is gone; an orphan file is reported by the caller's file count */
    }
  });
  void prisma;
}
