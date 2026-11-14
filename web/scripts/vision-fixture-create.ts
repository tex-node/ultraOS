/**
 * Create a vision fixture chain and leave it in place (5c-iii Action 1).
 *
 * Unlike the sync test, this one must NOT clean up: the Python dispatcher is about to write observations into it, and the whole point
 * is to look at the rows afterwards. Prints the ids as JSON so the caller can use them.
 *
 * Run (from web/): node --conditions=react-server --import tsx scripts/vision-fixture-create.ts <absolute-video-path>
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";

const videoPath = process.argv[2];
if (!videoPath) throw new Error("usage: vision-fixture-create.ts <absolute-video-path>");

async function main() {
  const organization = await prisma.organization.findFirst({ where: { slug: "e2e-league" }, select: { id: true } });
  if (!organization) throw new Error("organization e2e-league not found - run the e2e seed first");
  const organizationId = organization.id;

  const fixture = await prisma.fixture.findFirst({ where: { organizationId }, select: { id: true } });
  if (!fixture) throw new Error("no fixture in the test organization");
  const user = await prisma.user.findFirst({ where: { email: "e2e-admin@ultraleagueos.test" }, select: { id: true } });
  if (!user) throw new Error("e2e admin not found");

  const mediaAsset = await prisma.mediaAsset.create({
    data: {
      organizationId,
      storageProvider: "LOCAL_PERSISTENT_STORAGE",
      // video_path_for() strips file:// and uses the rest verbatim, which is how a local file reaches the detector.
      objectKey: `vision-fixture/${randomUUID()}.mp4`,
      publicUrl: `file://${videoPath}`,
      mimeType: "video/mp4",
      byteSize: 1,
      checksumSha256: "0".repeat(64),
      purpose: "GAME_VIDEO",
      uploadedById: user.id,
    },
    select: { id: true },
  });

  const gameVideo = await prisma.gameVideo.create({
    data: {
      organizationId,
      fixtureId: fixture.id,
      mediaAssetId: mediaAsset.id,
      sourceType: "FULL_GAME",
      registeredById: user.id,
    },
    select: { id: true },
  });

  const visionModel = await prisma.visionModel.create({
    data: { organizationId, key: "yolov8n-person", version: `dispatcher-${Date.now()}` },
    select: { id: true },
  });

  const run = await prisma.visionAnalysisRun.create({
    data: { organizationId, gameVideoId: gameVideo.id, visionModelId: visionModel.id, requestedById: user.id },
    select: { id: true },
  });

  console.log(
    JSON.stringify({
      organizationId,
      mediaAssetId: mediaAsset.id,
      gameVideoId: gameVideo.id,
      visionModelId: visionModel.id,
      analysisRunId: run.id,
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
