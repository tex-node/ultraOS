// G.21 Part XLIX-LIV: the offline/local vision analysis entrypoint. Deliberately NOT run inside
// the Next.js web process (Part L/LXXIII - "the production web process should not be responsible
// for GPU inference"). This is the architectural extension point a real computer-vision pipeline
// would plug into: it owns the AnalysisRun lifecycle (QUEUED -> PROCESSING -> COMPLETED/FAILED),
// but does not itself perform detection.
//
// Honest status (Part LIV, LXXI): this environment has no registered game video (confirmed via
// the G.21 pre-work invariant check - MediaAsset has zero video/* rows) and no computer-vision
// inference stack (no Python/CV runtime, no model weights, no GPU). Running this script against
// a real --video=<id> today will find no eligible video and correctly report
// VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO rather than fabricate detections - see Part LII's
// own instruction: "If no video asset is available: build the architecture... but DO NOT claim
// vision detection has been proven."
//
// Usage:
//   npm run vision:analyze -- --video=<gameVideoId> --model=PLAYER_DETECTOR_V1
import { prisma } from "../src/lib/prisma";
import { ensureVisionModel, createAnalysisRun, setAnalysisRunStatus } from "../src/lib/vision/vision-loader";

const ACTOR_ID = "cmqgct5pb000020kkm0aqtes2";

function parseArgs() {
  const args = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1], match[2]);
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const videoId = args.get("video");
  const modelKey = args.get("model") ?? "PLAYER_DETECTOR_V1";

  if (!videoId) {
    console.log("VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO: no --video=<gameVideoId> supplied.");
    console.log("Registered videos in this environment: checking...");
    const count = await prisma.gameVideo.count();
    console.log(`GameVideo rows: ${count}. ${count === 0 ? "None registered - there is nothing to analyze yet." : "Pass one of their ids via --video="}.`);
    process.exitCode = 0;
    return;
  }

  const video = await prisma.gameVideo.findUnique({ where: { id: videoId }, include: { mediaAsset: true } });
  if (!video) {
    console.log(`VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO: no GameVideo found with id ${videoId}.`);
    process.exitCode = 1;
    return;
  }
  if (!video.analysisEligible) {
    console.log(`GameVideo ${videoId} is marked analysisEligible=false. Nothing to do.`);
    process.exitCode = 1;
    return;
  }

  const model = await ensureVisionModel(modelKey, "0.1.0-poc", "G.21 offline proof-of-concept - architecture only, no real inference implemented");
  const run = await createAnalysisRun({ gameVideoId: video.id, visionModelId: model.id, requestedById: ACTOR_ID });
  await setAnalysisRunStatus(run.id, "PROCESSING", { startedAt: new Date() });

  // --- THIS IS THE EXTENSION POINT ---
  // A real pipeline would decode `video.mediaAsset.publicUrl` (or fetch it from
  // storageProvider/objectKey), run a person-detection model over sampled frames, and call
  // recordObservation() from vision-loader.ts for each detection. No such inference exists in
  // this Node/TypeScript project (no Python/CV runtime, no model weights) and no real Ultra
  // Basketball game video exists in this environment to run it against even if it did - see
  // Part LIV. Marking the run FAILED with an honest, specific reason rather than fabricating
  // COMPLETED with zero real observations (which would misleadingly look like "analyzed, nothing
  // found" instead of "never actually ran").
  await setAnalysisRunStatus(run.id, "FAILED", {
    completedAt: new Date(),
    errorMessage: "VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO: no computer-vision inference implementation exists in this environment (no CV runtime, no model weights, no GPU worker). This run recorded the QUEUED->PROCESSING->FAILED lifecycle correctly but performed no real detection.",
  });
  console.log("VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO");
  console.log(`AnalysisRun ${run.id} created and correctly marked FAILED with an honest reason - see documentation/vision/VISION_WORKER_ARCHITECTURE.md.`);
}

main()
  .catch((error) => {
    console.error("vision-analyze failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
