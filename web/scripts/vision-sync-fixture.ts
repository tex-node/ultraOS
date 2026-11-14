/**
 * 5c-ii-a — prove `/api/vision/sync` accepts observations and is idempotent.
 *
 * Builds the smallest valid chain the schema allows (MediaAsset → GameVideo → VisionModel → VisionAnalysisRun), mints an agent
 * token exactly as the desktop agent does, POSTs three synthetic observations twice, and counts the rows that actually landed.
 *
 * "The code says ON CONFLICT DO NOTHING" is not evidence; a second POST returning `accepted: 0` and three rows in the table is.
 *
 * Run (from web/): node --conditions=react-server --import tsx scripts/vision-sync-fixture.ts [baseUrl]
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { signAgentToken } from "./vision-sync-token";

const BASE = process.argv[2] ?? "http://localhost:4173";
const ORG_SLUG = "e2e-league";

async function main() {
  const organization = await prisma.organization.findFirst({ where: { slug: ORG_SLUG }, select: { id: true } });
  if (!organization) throw new Error(`organization ${ORG_SLUG} not found - run the e2e seed first`);
  const organizationId = organization.id;

  const fixture = await prisma.fixture.findFirst({ where: { organizationId }, select: { id: true } });
  if (!fixture) throw new Error("no fixture in the test organization");

  const user = await prisma.user.findFirst({ where: { email: "e2e-admin@ultraleagueos.test" }, select: { id: true } });
  if (!user) throw new Error("e2e admin not found");

  // --- the chain ---------------------------------------------------------------------------------------------------------
  const mediaAsset = await prisma.mediaAsset.create({
    data: {
      organizationId,
      storageProvider: "LOCAL_PERSISTENT_STORAGE",
      objectKey: `vision-fixture/${randomUUID()}.mp4`,
      mimeType: "video/mp4",
      byteSize: 1024,
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
    data: { organizationId, key: "yolov8n-person", version: `fixture-${Date.now()}` },
    select: { id: true },
  });

  const run = await prisma.visionAnalysisRun.create({
    data: {
      organizationId,
      gameVideoId: gameVideo.id,
      visionModelId: visionModel.id,
      requestedById: user.id,
    },
    select: { id: true },
  });

  console.log(`fixture: org=${organizationId} gameVideo=${gameVideo.id} run=${run.id} model=${visionModel.id}`);

  // --- the sync -----------------------------------------------------------------------------------------------------------
  const token = signAgentToken({ userId: user.id, orgId: organizationId });
  const observations = [1000, 2000, 3000].map((videoTimeMs) => ({
    id: randomUUID(),
    videoTimeMs,
    observationType: "PERSON_DETECTED",
    boundingBox: { x: 0.4, y: 0.3, width: 0.05, height: 0.12 },
    confidence: 0.9,
  }));

  const post = async () => {
    const response = await fetch(`${BASE}/api/vision/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-UltraOS-Token": token },
      body: JSON.stringify({ observations, gameVideoId: gameVideo.id, analysisRunId: run.id }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const first = await post();
  console.log(`POST once:  ${first.status} ${JSON.stringify(first.body)}`);
  const second = await post();
  console.log(`POST again: ${second.status} ${JSON.stringify(second.body)}`);

  const ids = observations.map((observation) => observation.id);
  const rows = await prisma.visionObservation.findMany({ where: { id: { in: ids } }, select: { id: true } });
  console.log(`VisionObservation rows: ${rows.length} (of ${ids.length} submitted)`);

  const ok =
    first.status === 200 &&
    first.body.accepted === 3 &&
    first.body.rejected === 0 &&
    second.status === 200 &&
    second.body.accepted === 0 &&
    rows.length === 3;

  // --- cleanup ------------------------------------------------------------------------------------------------------------
  await prisma.visionObservation.deleteMany({ where: { analysisRunId: run.id } });
  await prisma.visionAnalysisRun.delete({ where: { id: run.id } });
  await prisma.gameVideo.delete({ where: { id: gameVideo.id } });
  await prisma.mediaAsset.delete({ where: { id: mediaAsset.id } });
  await prisma.visionModel.delete({ where: { id: visionModel.id } });
  console.log("fixture cleaned up");

  console.log(`\n  ${ok ? "PASS" : "FAIL"} — accept + idempotency`);
  process.exit(ok ? 0 : 1);
}

main().catch(async (error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
