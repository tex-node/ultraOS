import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { Prisma } from "@/generated/prisma/client";

// Highlight clips from a confirmed vision observation (streak v15, Prompt 4).
//
// When a reviewer confirms an observation at 12:05, the ten seconds around it (5 before, 5 after) are cut with ffmpeg
// and stored as a MediaAsset with purpose HIGHLIGHT_CLIP, linked to the fixture and - when the observation names one -
// to the player's athlete. Nothing is produced for an observation that has no game video or no timestamp.
//
// Honesty rules baked in:
//   * the clip is cut from the ORIGINAL file the analysis read, not from a re-encode of a re-encode;
//   * a cut that yields no bytes, or an ffmpeg non-zero exit, is an ERROR - never an empty asset that looks like a clip;
//   * the asset records the window it was cut from, so a reviewer can see exactly which seconds are in the clip.
const execFileAsync = promisify(execFile);

export const HIGHLIGHT_WINDOW_SECONDS = 5;

export type HighlightResult = {
  ok: boolean;
  mediaAssetId?: string;
  clipPath?: string;
  startSeconds?: number;
  durationSeconds?: number;
  bytes?: number;
  reason?: string;
};

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}

/**
 * Cut a clip around `videoTimeMs` from `sourcePath`.
 *
 * `-ss` before `-i` seeks by keyframe (fast, correct for a cut this short); `-t` bounds the duration; `-c copy` keeps
 * the source codec so the clip is playable anywhere the original was, and `-avoid_negative_ts make_zero` keeps the
 * timestamps sane after the seek.
 */
export async function cutHighlightClip(args: {
  sourcePath: string;
  videoTimeMs: number;
  outputDir: string;
  stem: string;
}): Promise<{ clipPath: string; startSeconds: number; durationSeconds: number; bytes: number }> {
  await mkdir(args.outputDir, { recursive: true });
  const startSeconds = Math.max(0, args.videoTimeMs / 1000 - HIGHLIGHT_WINDOW_SECONDS);
  const durationSeconds = HIGHLIGHT_WINDOW_SECONDS * 2;
  const clipPath = join(args.outputDir, `${args.stem}.mp4`);

  await execFileAsync(ffmpegBin(), [
    "-y",
    "-loglevel", "error",
    "-ss", startSeconds.toFixed(3),
    "-i", args.sourcePath,
    "-t", durationSeconds.toFixed(3),
    "-c", "copy",
    "-avoid_negative_ts", "make_zero",
    "-movflags", "+faststart",
    clipPath,
  ]);

  const info = await stat(clipPath);
  if (info.size <= 0) throw new Error("ffmpeg produced an empty clip");
  return { clipPath, startSeconds, durationSeconds, bytes: info.size };
}

/** Store the clip as a MediaAsset and link it to the fixture (and the athlete, when the observation names one). */
export async function saveHighlightAsset(
  tx: Prisma.TransactionClient,
  args: {
    organizationId: string;
    fixtureId: string;
    mediaAssetIdOfSource: string;
    clipPath: string;
    startSeconds: number;
    durationSeconds: number;
    observationId: string;
    athleteId: string | null;
    uploadedById: string;
  },
): Promise<{ mediaAssetId: string }> {
  const bytes = await readFile(args.clipPath);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const objectKey = `highlights/${args.organizationId}/${basename(args.clipPath)}`;

  const asset = await tx.mediaAsset.create({
    data: {
      organizationId: args.organizationId,
      storageProvider: "LOCAL_PERSISTENT_STORAGE",
      objectKey,
      publicUrl: `file://${args.clipPath}`,
      originalFilename: basename(args.clipPath),
      mimeType: "video/mp4",
      byteSize: bytes.byteLength,
      checksumSha256: checksum,
      status: "UPLOADED",
      purpose: "HIGHLIGHT_CLIP",
      title: `Highlight from ${args.startSeconds.toFixed(0)}s (${args.durationSeconds.toFixed(0)}s)`,
      source: `vision:${args.observationId}`,
      uploadedById: args.uploadedById,
    },
    select: { id: true },
  });

  // The link is what the UI reads: a highlight belongs to a fixture, and to an athlete when the observation does.
  await tx.mediaAssetUsage.create({
    data: {
      organizationId: args.organizationId,
      assetId: asset.id,
      purpose: "HIGHLIGHT_CLIP",
      entityType: "FIXTURE",
      entityId: args.fixtureId,
      assignedById: args.uploadedById,
    },
  });
  if (args.athleteId) {
    await tx.mediaAssetUsage.create({
      data: {
        organizationId: args.organizationId,
        assetId: asset.id,
        purpose: "HIGHLIGHT_CLIP",
        entityType: "ATHLETE",
        entityId: args.athleteId,
        assignedById: args.uploadedById,
      },
    });
  }
  return { mediaAssetId: asset.id };
}

/** The highlights a fixture has, for the match centre. */
export async function loadFixtureHighlights(tx: Prisma.TransactionClient, organizationId: string, fixtureId: string) {
  const usages = await tx.mediaAssetUsage.findMany({
    where: { organizationId, purpose: "HIGHLIGHT_CLIP", entityType: "FIXTURE", entityId: fixtureId, active: true },
    select: { assetId: true },
    orderBy: { assignedAt: "desc" },
  });
  if (usages.length === 0) return [];
  // MediaAsset has no durationSeconds column; the clip length is in the title (written when the asset was created) and
  // the file itself. Selecting the columns that exist rather than inventing one.
  return tx.mediaAsset.findMany({
    where: { organizationId, id: { in: usages.map((usage) => usage.assetId) } },
    select: { id: true, title: true, publicUrl: true, byteSize: true, createdAt: true, source: true },
  });
}
