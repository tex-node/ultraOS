// P15 / Prompt 5: prove the VISION INFRASTRUCTURE works without any real inference.
//
// Real game video does not exist (0 GameVideo rows in staging and production, checked 2026-10-18), so the
// inference itself stays BLOCKED_NO_REAL_VIDEO. What CAN be proven is everything around it: registering a
// video, creating an analysis run for a model, writing observations, and - the part that matters - the
// human review workflow in /vision/games/[fixtureId] that accepts or rejects each candidate.
//
// This script inserts:
//   MediaAsset (fake video file metadata) -> GameVideo -> VisionModel -> VisionAnalysisRun (COMPLETED)
//   -> two VisionObservations: one made 2-pointer by a specific player at a specific time, one rebound.
// It then exercises the real review path through reviewObservation() (the same function the Server Action
// calls) - accept one, reject the other - and prints the resulting statuses.
//
// Usage (staging):
//   DATABASE_URL=... node --conditions=react-server --import tsx scripts/vision-mock-run.ts \
//     --organization <org> --fixture <fixture> --player <player> --actor <user> [--cleanup]
//
// Everything it creates is prefixed "MOCK" so it is obvious in the UI and easy to delete (--cleanup).
import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { ensureVisionModel, createAnalysisRun, reviewObservation } from "../src/lib/vision/vision-loader";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const ORG = arg("organization");
const FIXTURE = arg("fixture");
const PLAYER = arg("player");
const ACTOR = arg("actor");
const CLEANUP = process.argv.includes("--cleanup");
// --no-review leaves the observations PENDING, so the review queue page can be inspected with work in it.
const NO_REVIEW = process.argv.includes("--no-review");
const TAG = "MOCK";

if (CLEANUP) {
  // Cleanup needs ONLY --organization: it must be runnable after the fixture or player has been deleted,
  // and requiring ids it is about to delete was a usability bug (the first cleanup run refused).
  if (!ORG) {
    console.error("usage: vision-mock-run.ts --cleanup --organization <id>");
    process.exit(1);
  }
} else if (!ORG || !FIXTURE || !PLAYER || !ACTOR) {
  console.error("usage: vision-mock-run.ts --organization <id> --fixture <id> --player <id> --actor <user-id> [--cleanup]");
  process.exit(1);
}

async function main() {
  if (CLEANUP) {
    const removed = await withOrganizationContext(ORG!, async (tx) => {
      const videos = await tx.gameVideo.findMany({
        where: { organizationId: ORG!, cameraLabel: { startsWith: TAG } },
        select: { id: true, mediaAssetId: true },
      });
      // The synthetic model is registry data, not a video: remove it only when nothing references it any
      // more, so a real model with the same key is never deleted out from under a run. Done FIRST, because
      // an early return for "no videos" previously left the model row behind.
      await tx.visionModel.deleteMany({ where: { organizationId: ORG!, key: "MOCK-DETECTOR", analysisRuns: { none: {} } } });
      if (videos.length === 0) return 0;
      const ids = videos.map((video) => video.id);
      // Runs and observations cascade from GameVideo; the media asset does not, so delete it explicitly.
      await tx.visionObservation.deleteMany({ where: { gameVideoId: { in: ids } } });
      await tx.visionAnalysisRun.deleteMany({ where: { gameVideoId: { in: ids } } });
      await tx.gameVideo.deleteMany({ where: { id: { in: ids } } });
      await tx.mediaAsset.deleteMany({ where: { id: { in: videos.map((video) => video.mediaAssetId) } } });
      return videos.length;
    });
    console.log(`cleanup: removed ${removed} mock video(s) and their runs/observations`);
    return;
  }

  const base = await withOrganizationContext(ORG!, async (tx) => {
    const fixture = await tx.fixture.findFirstOrThrow({
      where: { id: FIXTURE!, organizationId: ORG! },
      select: { id: true, game: { select: { id: true } }, homeSeasonClub: { select: { club: { select: { name: true } } } }, awaySeasonClub: { select: { club: { select: { name: true } } } } },
    });
    const player = await tx.player.findFirstOrThrow({
      where: { id: PLAYER!, organizationId: ORG! },
      select: { id: true, athleteId: true, jerseyNumber: true, athlete: { select: { firstName: true, lastName: true } } },
    });

    // 1. A MediaAsset stands in for the video file. Nothing ever reads the bytes in this test.
    const checksum = createHash("sha256").update(`${TAG}-mock-video-${Date.now()}`).digest("hex");
    const asset = await tx.mediaAsset.create({
      data: {
        organizationId: ORG!,
        storageProvider: "LOCAL_PERSISTENT_STORAGE",
        objectKey: `mock/${checksum}.mp4`,
        originalFilename: `${TAG}-game-video.mp4`,
        mimeType: "video/mp4",
        byteSize: 1024 * 1024,
        checksumSha256: checksum,
        purpose: "GAME_VIDEO",
        title: `${TAG} synthetic game video (no real footage)`,
        uploadedById: ACTOR!,
      },
      select: { id: true },
    });

    // 2. GameVideo row: the registration the pipeline would normally do from a real upload.
    const video = await tx.gameVideo.create({
      data: {
        organizationId: ORG!,
        fixtureId: fixture.id,
        gameId: fixture.game?.id ?? null,
        mediaAssetId: asset.id,
        sourceType: "PHONE_RECORDING",
        durationSeconds: 3600,
        frameRate: 25,
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        cameraLabel: `${TAG} camera (synthetic)`,
        registeredById: ACTOR!,
        analysisEligible: true,
        visionCapability: "VIDEO_REGISTERED",
        ingestStatus: "READY_FOR_ANALYSIS",
      },
      select: { id: true },
    });

    return { fixtureId: fixture.id, matchLabel: `${fixture.homeSeasonClub?.club.name ?? "Home"} vs ${fixture.awaySeasonClub?.club.name ?? "Away"}`, videoId: video.id, playerId: player.id, jersey: player.jerseyNumber ?? null, playerName: `${player.athlete.firstName} ${player.athlete.lastName}` };
  });

  // Each step runs in its OWN organization transaction: createAnalysisRun/reviewObservation open their
  // own withOrganizationContext(), and a row created inside an outer transaction is invisible to them
  // (separate connections). The first attempt failed exactly there - keep the steps separate.
  const model = await ensureVisionModel(ORG!, "MOCK-DETECTOR", "0.0.0-mock", "Synthetic model used to prove the review workflow without inference");
  const run = await createAnalysisRun(ORG!, { gameVideoId: base.videoId, visionModelId: model.id, requestedById: ACTOR!, configHash: "mock-config" });
  console.log(`video: ${base.videoId} Â· run: ${run.id} Â· model: ${model.key}@${model.version}`);

  const { shot, rebound } = await withOrganizationContext(ORG!, async (tx) => {
    await tx.visionAnalysisRun.update({ where: { id: run.id }, data: { status: "COMPLETED", startedAt: new Date(), completedAt: new Date(), observationCount: 2 } });
    // 3. Two observations: a made 2-pointer at 12:05 by a specific player, and a rebound at 12:11.
    const shot = await tx.visionObservation.create({
      data: {
        organizationId: ORG!,
        analysisRunId: run.id,
        gameVideoId: base.videoId,
        videoTimeMs: 12 * 60 * 1000 + 5000,
        videoTimeEndMs: 12 * 60 * 1000 + 6000,
        observationType: "SHOT_MADE_CANDIDATE",
        boundingBox: { x: 0.42, y: 0.31, width: 0.08, height: 0.22 },
        playerCandidatePlayerId: base.playerId,
        jerseyCandidateNumber: base.jersey,
        eventCandidateType: "TWO_POINT_MADE",
        confidence: 0.87,
        status: "PENDING",
        rawMetadata: { mock: true, note: `Synthetic made 2 by #${base.jersey ?? "?"} at 12:05` },
      },
      select: { id: true },
    });
    const rebound = await tx.visionObservation.create({
      data: {
        organizationId: ORG!,
        analysisRunId: run.id,
        gameVideoId: base.videoId,
        videoTimeMs: 12 * 60 * 1000 + 11000,
        observationType: "REBOUND_CANDIDATE",
        boundingBox: { x: 0.55, y: 0.28, width: 0.09, height: 0.24 },
        playerCandidatePlayerId: base.playerId,
        confidence: 0.62,
        status: "PENDING",
        rawMetadata: { mock: true, note: "Synthetic rebound" },
      },
      select: { id: true },
    });
    return { shot, rebound };
  });

  const result = { ...base, runId: run.id, shotId: shot.id, reboundId: rebound.id };
  console.log(`fixture: ${result.matchLabel} (${result.fixtureId})`);
  console.log(`player: ${result.playerName}`);
  console.log(`observations: shot=${result.shotId} rebound=${result.reboundId}`);
  console.log(`review URL: /vision/games/${result.fixtureId}`);

  if (NO_REVIEW) {
    console.log("review: skipped (--no-review) - the observations are PENDING in the queue");
    return;
  }

  // 4. Exercise the REAL review path (the same function the Server Action calls).
  const confirmed = await reviewObservation(ORG!, result.shotId, "CONFIRMED", ACTOR!, "mock review: accept");
  const rejected = await reviewObservation(ORG!, result.reboundId, "REJECTED", ACTOR!, "mock review: reject");
  console.log(`review: shot -> ${confirmed.status} Ã‚Â· rebound -> ${rejected.status}`);

  const audit = await prisma.auditLog.count({ where: { organizationId: ORG!, entityType: "VisionObservation", action: "VISION_OBSERVATION_REVIEWED" } });
  console.log(`audit entries for vision reviews: ${audit}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
