import { prisma } from "../src/lib/prisma";
import { reviewObservation } from "../src/lib/vision/vision-loader";

// Streak v7, Prompt 4: exercise the Confirm/Reject path the vision page's buttons call.
//
//   npx tsx scripts/vision-review-verify.ts --organization <orgId> --actor <userId> [--fixture <id>]
//
// Confirms one mock observation and rejects another, then reads them back. This is the same
// `reviewObservation` the server action calls, so the status transition and the audit row are the real ones;
// only the button press is simulated (a server action needs a browser session, and the page render is
// verified separately over HTTP).
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const FIXTURE = arg("fixture");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: vision-review-verify.ts --organization <id> --actor <userId> [--fixture <id>]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  const observations = await prisma.visionObservation.findMany({
    where: { organizationId: ORG, ...(FIXTURE ? { fixtureId: FIXTURE } : {}) },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { id: true, status: true, fixtureId: true, eventType: true },
  });
  if (observations.length < 2) {
    console.log(`FAIL: need two mock observations to confirm and reject, found ${observations.length}`);
    process.exitCode = 1;
    return;
  }
  const [toConfirm, toReject] = observations;
  console.log(`confirming ${toConfirm.id} (${toConfirm.eventType}, was ${toConfirm.status})`);
  const confirmed = await reviewObservation(ORG, toConfirm.id, "CONFIRMED", ACTOR, "verification: mock observation confirmed");
  console.log(`rejecting  ${toReject.id} (${toReject.eventType}, was ${toReject.status})`);
  const rejected = await reviewObservation(ORG, toReject.id, "REJECTED", ACTOR, "verification: mock observation rejected");

  const audits = await prisma.auditLog.count({ where: { organizationId: ORG, action: "VISION_OBSERVATION_REVIEWED", entityId: { in: [toConfirm.id, toReject.id] } } });
  console.log(`statuses now: ${confirmed.status} / ${rejected.status} · audit rows: ${audits}`);

  const problems: string[] = [];
  if (confirmed.status !== "CONFIRMED") problems.push(`confirmed status is ${confirmed.status}`);
  if (rejected.status !== "REJECTED") problems.push(`rejected status is ${rejected.status}`);
  if (audits !== 2) problems.push(`${audits} audit row(s), expected 2`);
  console.log("");
  console.log(problems.length === 0 ? "PASS: confirm and reject both work through the page's own service" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
