// Streak v4, Prompt 4: one command to ingest a real game video when it arrives.
//
// There is no footage yet (0 GameVideo rows in staging and production), so this script is the READINESS
// work: probe the file, store it where the vision service can read it, register the MediaAsset +
// GameVideo rows, and ask the Python worker (services/vision, B0) to queue an analysis run. The worker
// will fail today because there is no model - that failure is the *correct* outcome and is reported, not
// hidden.
//
//   npx tsx scripts/vision-ingest.ts \
//     --file /path/to/game.mp4 --fixture <fixtureId> --organization <orgId> --actor <userId> \
//     [--camera "Camera 1"] [--source PHONE_RECORDING|FULL_GAME|CAMERA_ISO|BROADCAST_PROGRAM] \
//     [--worker http://127.0.0.1:8000] [--dry-run]
//
// Exits non-zero when the file cannot be probed or the rows cannot be written. A worker that is not
// reachable is a WARNING, not a failure: the GameVideo row is the durable state and the worker's beat
// poller picks up READY_FOR_ANALYSIS videos (services/vision/app/workers/tasks.py).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { writeAuditLog } from "../src/lib/audit";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const FILE = arg("file");
const FIXTURE = arg("fixture");
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const CAMERA = arg("camera") ?? "Camera 1";
const SOURCE = arg("source") ?? "PHONE_RECORDING";
// The service's own default port is 8000 (services/vision/.env.example), which on THIS host is occupied
// by an unrelated Kong gateway, so the URL is explicit and a 401 says so rather than looking like a bug.
const WORKER = arg("worker") ?? process.env.VISION_WORKER_URL ?? "http://127.0.0.1:8010";
const WORKER_TOKEN = arg("token") ?? process.env.VISION_WORKER_TOKEN ?? "";
const DRY_RUN = flag("dry-run");

const ALLOWED_SOURCES = new Set(["FULL_GAME", "CAMERA_ISO", "BROADCAST_PROGRAM", "PHONE_RECORDING", "TRAINING_CLIP", "HIGHLIGHT_CLIP"]);

type Probe = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  sizeBytes: number;
};

function ffprobe(path: string): Probe {
  const result = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], { encoding: "utf8" });
  if (result.error) throw new Error(`ffprobe is not available: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffprobe could not read ${path}: ${(result.stderr || "").trim() || `exit ${result.status}`}`);
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string; size?: string };
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; duration?: string }[];
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const rate = video?.avg_frame_rate ?? video?.r_frame_rate ?? "";
  const [numerator, denominator] = rate.split("/").map(Number);
  const frameRate = Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : null;
  const duration = Number(parsed.format?.duration ?? video?.duration ?? "");
  return {
    durationSeconds: Number.isFinite(duration) ? Math.round(duration) : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    frameRate,
    videoCodec: video?.codec_name ?? null,
    sizeBytes: statSync(path).size,
  };
}

// The storage layout mirrors what media-storage's local provider does (`<root>/originals/<...>`), so a
// video registered here is found by the same reader. Copying (not moving) keeps the operator's source
// file intact; a real deployment would upload to R2 and set the object key only.
function storeLocally(path: string, organizationId: string, checksum: string): { objectKey: string; storedPath: string; root: string } {
  const root = process.env.MEDIA_LOCAL_ROOT ?? (process.cwd().includes("/opt/ultraos-staging/") ? "/opt/ultraos-staging/shared/media" : join(process.cwd(), ".media"));
  const extension = extname(path) || ".mp4";
  const objectKey = `originals/${organizationId}/video/${checksum}${extension}`;
  const storedPath = join(root, objectKey);
  mkdirSync(join(root, "originals", organizationId, "video"), { recursive: true });
  copyFileSync(path, storedPath);
  return { objectKey, storedPath, root };
}

async function notifyWorker(gameVideoId: string, organizationId: string, actorId: string): Promise<string> {
  // POST /analyze is the B0 worker's queue endpoint: it creates the VisionAnalysisRun and dispatches the
  // Celery task. The run row is the durable state, so a failure here is reported and not fatal.
  try {
    const response = await fetch(`${WORKER.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(WORKER_TOKEN ? { authorization: `Bearer ${WORKER_TOKEN}` } : {}) },
      body: JSON.stringify({ game_video_id: gameVideoId, organization_id: organizationId, requested_by_id: actorId }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.text();
    if (!response.ok) {
      const hint =
        response.status === 401
          ? " - is something else listening on that port (this host runs a Kong gateway on 8000), or does the service need --token?"
          : "";
      return `WARNING: worker returned ${response.status}${hint}: ${body.slice(0, 300)}`;
    }
    return `worker queued: ${body.slice(0, 300)}`;
  } catch (error) {
    return `WARNING: worker not reachable at ${WORKER} (${error instanceof Error ? error.message : String(error)}). The GameVideo row is READY_FOR_ANALYSIS; the worker's poller will pick it up once it is up.`;
  }
}

async function main() {
  if (!FILE || !FIXTURE || !ORGANIZATION || !ACTOR) {
    console.error("usage: vision-ingest.ts --file <path> --fixture <id> --organization <id> --actor <userId> [--camera X] [--source TYPE] [--worker URL] [--dry-run]");
    process.exit(1);
  }
  if (!existsSync(FILE)) throw new Error(`file not found: ${FILE}`);
  if (!ALLOWED_SOURCES.has(SOURCE)) throw new Error(`--source must be one of ${[...ALLOWED_SOURCES].join(", ")}`);

  console.log(`file:      ${FILE} (${(statSync(FILE).size / 1024 / 1024).toFixed(1)} MB)`);
  const probe = ffprobe(FILE);
  console.log(`probe:     ${probe.durationSeconds}s Â· ${probe.width}x${probe.height} Â· ${probe.frameRate ?? "?"} fps Â· ${probe.videoCodec ?? "?"}`);
  if (probe.durationSeconds === null || probe.width === null) throw new Error("ffprobe returned no video stream - is this really a video file?");

  const checksum = createHash("sha256");
  const { readFileSync } = await import("node:fs");
  checksum.update(readFileSync(FILE));
  const sha256 = checksum.digest("hex");
  console.log(`sha256:    ${sha256}`);

  // Both rows must agree on the organization: look the fixture up inside it first, so a wrong id fails
  // here instead of creating an orphan video.
  const fixture = await withOrganizationContext(ORGANIZATION, (tx) =>
    tx.fixture.findFirst({ where: { id: FIXTURE, organizationId: ORGANIZATION }, select: { id: true, scheduledAt: true, homeSeasonClub: { select: { club: { select: { name: true } } } }, awaySeasonClub: { select: { club: { select: { name: true } } } } } }),
  );
  if (!fixture) throw new Error(`fixture ${FIXTURE} not found in organization ${ORGANIZATION}`);
  console.log(`fixture:   ${fixture.homeSeasonClub?.club.name} vs ${fixture.awaySeasonClub?.club.name} (${fixture.scheduledAt.toISOString().slice(0, 10)})`);

  const existing = await withOrganizationContext(ORGANIZATION, (tx) => tx.gameVideo.findFirst({ where: { organizationId: ORGANIZATION, fixtureId: FIXTURE, mediaAsset: { checksumSha256: sha256 } }, select: { id: true } }));
  if (existing) {
    console.log(`already registered as GameVideo ${existing.id} - nothing to do`);
    return;
  }

  if (DRY_RUN) {
    console.log("dry run: would copy the file, create MediaAsset + GameVideo, and POST /analyze. Nothing written.");
    return;
  }

  const stored = storeLocally(FILE, ORGANIZATION, sha256);
  console.log(`stored:    ${stored.storedPath}`);

  const created = await withOrganizationContext(ORGANIZATION, async (tx) => {
    const asset = await tx.mediaAsset.create({
      data: {
        organizationId: ORGANIZATION,
        storageProvider: "LOCAL_PERSISTENT_STORAGE",
        objectKey: stored.objectKey,
        originalFilename: basename(FILE),
        mimeType: "video/mp4",
        byteSize: probe.sizeBytes,
        width: probe.width,
        height: probe.height,
        checksumSha256: sha256,
        purpose: "GAME_VIDEO",
        title: `${fixture.homeSeasonClub?.club.name} vs ${fixture.awaySeasonClub?.club.name} - ${CAMERA}`,
        source: "vision-ingest.ts",
        uploadedById: ACTOR,
      },
      select: { id: true },
    });
    const video = await tx.gameVideo.create({
      data: {
        organizationId: ORGANIZATION,
        fixtureId: FIXTURE,
        mediaAssetId: asset.id,
        sourceType: SOURCE as "FULL_GAME" | "CAMERA_ISO" | "BROADCAST_PROGRAM" | "PHONE_RECORDING" | "TRAINING_CLIP" | "HIGHLIGHT_CLIP",
        durationSeconds: probe.durationSeconds,
        frameRate: probe.frameRate,
        resolutionWidth: probe.width,
        resolutionHeight: probe.height,
        recordingStartedAt: fixture.scheduledAt,
        cameraLabel: CAMERA,
        registeredById: ACTOR,
        analysisEligible: true,
        visionCapability: "VIDEO_REGISTERED",
        // Ready for the worker: the media exists and the probe succeeded.
        ingestStatus: "READY_FOR_ANALYSIS",
      },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      organizationId: ORGANIZATION,
      userId: ACTOR,
      action: "GAME_VIDEO_INGESTED",
      entityType: "GameVideo",
      entityId: video.id,
      details: { fixtureId: FIXTURE, mediaAssetId: asset.id, sha256, probe, camera: CAMERA, source: SOURCE, objectKey: stored.objectKey },
    });
    return { assetId: asset.id, videoId: video.id };
  });

  console.log(`media:     ${created.assetId}`);
  console.log(`gameVideo: ${created.videoId} (READY_FOR_ANALYSIS)`);
  console.log(await notifyWorker(created.videoId, ORGANIZATION, ACTOR));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
