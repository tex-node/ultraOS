import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { linkVideoToSession, loadVisionMetricsForSession, syncTrainingMetricsFromVision } from "../src/server/vision/training-bridge";
import { randomUUID } from "node:crypto";

// Streak v13, Prompt 2 verification: a real analysed clip becomes a session metric.
//
//   npx tsx scripts/vision-training-bridge-verify.ts --organization <orgId> --actor <userId> [--keep]
//
// It finds the analysed clip the vision pipeline produced (the one with 300 person observations), creates a training
// session with two participants, links the clip, runs the bridge, and asserts:
//   - the metric rows exist and carry the observation count;
//   - running the bridge again UPDATES them instead of duplicating (idempotence);
//   - the shot metric is SKIPPED with the reason "no shot classifier", rather than being written as zero.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: vision-training-bridge-verify.ts --organization <id> --actor <userId> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;
const TAG = `VISION BRIDGE ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

async function main() {
  const video = await withOrganizationContext(ORG, (tx) =>
    tx.visionAnalysisRun.findFirst({
      where: { organizationId: ORG, status: "COMPLETED", observationCount: { gt: 0 } },
      orderBy: { completedAt: "desc" },
      select: { id: true, gameVideoId: true, observationCount: true },
    }),
  );
  if (!video) throw new Error("no completed analysis run with observations in this organization - run the vision pipeline first");
  console.log(`analysed clip: ${video.gameVideoId} · run ${video.id} · ${video.observationCount} observations`);

  const session = await withOrganizationContext(ORG, async (tx) => {
    const season = await tx.season.findFirst({ where: { organizationId: ORG }, select: { id: true, seasonClubs: { select: { id: true }, take: 1 } } });
    const created = await tx.trainingSession.create({
      data: {
        organizationId: ORG,
        seasonId: season?.id ?? null,
        seasonClubId: season?.seasonClubs[0]?.id ?? null,
        title: TAG,
        sessionType: "SHOOTING",
        occurredAt: new Date(),
        durationMinutes: 60,
        createdById: ACTOR_ID,
      },
      select: { id: true },
    });
    const athletes = await tx.athlete.findMany({ where: { organizationId: ORG }, take: 2, select: { id: true } });
    if (athletes.length === 0) throw new Error("no athletes in this organization");
    for (const athlete of athletes) {
      await tx.athleteTrainingRecord.create({
        data: { organizationId: ORG, trainingSessionId: created.id, athleteId: athlete.id, attendanceStatus: "PRESENT", createdById: ACTOR_ID },
      });
    }
    return { id: created.id, athletes: athletes.length };
  });
  console.log(`session ${session.id} with ${session.athletes} participants`);

  const linked = await withOrganizationContext(ORG, (tx) =>
    linkVideoToSession(tx, { organizationId: ORG, gameVideoId: video.gameVideoId, trainingSessionId: session.id }),
  );
  const first = await withOrganizationContext(ORG, (tx) => syncTrainingMetricsFromVision(tx, { organizationId: ORG, gameVideoId: video.gameVideoId }));
  const second = await withOrganizationContext(ORG, (tx) => syncTrainingMetricsFromVision(tx, { organizationId: ORG, gameVideoId: video.gameVideoId }));
  const rows = await withOrganizationContext(ORG, (tx) =>
    tx.athleteTrainingMetric.findMany({
      where: { organizationId: ORG, athleteTrainingRecord: { trainingSessionId: session.id } },
      select: { numericValue: true, metricDefinition: { select: { key: true, name: true } } },
    }),
  );
  const shown = await withOrganizationContext(ORG, (tx) => loadVisionMetricsForSession(tx, ORG, session.id));

  console.log("");
  console.log(`linked: ${linked}`);
  console.log(`first sync:  ${JSON.stringify(first.written)} · skipped ${JSON.stringify(first.skipped)}`);
  console.log(`second sync: ${JSON.stringify(second.written)} (idempotence)`);
  console.log(`metric rows: ${rows.length} · ${rows.map((row) => `${row.metricDefinition.key}=${row.numericValue}`).join(", ")}`);
  console.log(`session page shows: ${shown.map((metric) => `${metric.name} ${metric.value}`).join(" · ")}`);

  const problems: string[] = [];
  if (!linked) problems.push("the clip was not linked to the session");
  const frameMetric = first.written.find((entry) => entry.metricKey === "vision_athlete_frames");
  if (!frameMetric) problems.push("the athlete-frames metric was not written");
  else if (frameMetric.value !== video.observationCount) problems.push(`metric value ${frameMetric.value}, expected ${video.observationCount}`);
  if (rows.length !== session.athletes) problems.push(`${rows.length} metric rows, expected ${session.athletes} (one per participant)`);
  if (rows.some((row) => Number(row.numericValue) !== video.observationCount)) problems.push("a metric row has the wrong value");
  if (second.written.length !== first.written.length) problems.push("the second sync wrote a different set (not idempotent)");
  if (!first.skipped.some((entry) => entry.metricKey === "vision_shots_detected")) problems.push("the shot metric was not reported as skipped");
  if (shown.length === 0) problems.push("the session page shows no vision metrics");

  console.log("");
  console.log(problems.length === 0 ? "PASS: the analysed clip became a session metric, twice, without duplicating, and the unsupported metric was skipped with a reason" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.athleteTrainingMetric.deleteMany({ where: { athleteTrainingRecord: { trainingSessionId: session.id } } });
      await tx.gameVideo.updateMany({ where: { id: video.gameVideoId }, data: { trainingSessionId: null } });
      await tx.trainingSession.delete({ where: { id: session.id } });
      await tx.trainingMetricDefinition.deleteMany({ where: { key: { in: ["vision_athlete_frames", "vision_shots_detected"] } } });
    });
    console.log("cleanup: session, metrics and the video link removed (use --keep to inspect)");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
