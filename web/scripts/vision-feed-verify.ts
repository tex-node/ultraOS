import { createServer } from "node:http";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createFeedSubscription } from "../src/server/data-feed/subscriptions";
import { drainFeedDeliveries } from "../src/lib/data-feed/dispatcher";
import { verifyWebhookSignature } from "../src/lib/data-feed/signature";
import { reviewObservation } from "../src/lib/vision/vision-loader";

// Streak v14, Prompt 3 verification: a human confirms a vision observation, and a partner hears about it.
//
//   npx tsx scripts/vision-feed-verify.ts --organization <orgId> --actor <userId> [--video <gameVideoId>] [--base-url url]
//
// It uses a REAL completed analysis (the person clip's 300 observations), subscribes to VISION_EVENT_CONFIRMED,
// confirms one observation through the same function the review UI calls, drains, and asserts at the listener that
// the payload carries the AI provenance (box, confidence, type) and the human decision (reviewer, timestamp).
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
const PORT = Number(arg("port") ?? 8098);
const CRON_SECRET = process.env.CRON_SECRET ?? "";
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: vision-feed-verify.ts --organization <id> --actor <userId> [--base-url url]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;

async function main() {
  const observation = await withOrganizationContext(ORG, (tx) =>
    tx.visionObservation.findFirst({
      where: { organizationId: ORG, status: { not: "CONFIRMED" }, analysisRun: { status: "COMPLETED" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        confidence: true,
        observationType: true,
        eventCandidateType: true,
        boundingBox: true,
        gameVideoId: true,
        gameVideo: { select: { gameId: true, fixtureId: true } },
      },
    }),
  );
  if (!observation) throw new Error("no unconfirmed observation from a completed run - run the vision pipeline first");
  if (!observation.gameVideo.gameId) throw new Error("this video is not attached to a game, so a feed event has no game to belong to");
  console.log(`observation ${observation.id} · ${observation.observationType} · conf ${observation.confidence} · game ${observation.gameVideo.gameId}`);

  const subscription = await withOrganizationContext(ORG, (tx) =>
    createFeedSubscription(tx, {
      organizationId: ORG,
      userId: ACTOR_ID,
      name: "Vision confirmation verification",
      webhookUrl: `http://127.0.0.1:${PORT}/hooks`,
      events: ["VISION_EVENT_CONFIRMED"],
    }),
  );

  const received: { verified: boolean; body: Record<string, unknown> }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const verdict = verifyWebhookSignature(subscription.secret, body, String(request.headers["x-ultra-signature"] ?? ""));
      received.push({ verified: verdict.ok, body: JSON.parse(body) as Record<string, unknown> });
      response.writeHead(verdict.ok ? 200 : 401).end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  try {
    const before = await withOrganizationContext(ORG, (tx) => tx.dataFeedDelivery.count({ where: { organizationId: ORG, subscriptionId: subscription.id } }));
    await withOrganizationContext(ORG, (tx) => reviewObservation(ORG, observation.id, "CONFIRMED", ACTOR_ID, "verification: confirmed by script"));
    const queued = await withOrganizationContext(ORG, (tx) =>
      tx.dataFeedDelivery.findMany({ where: { organizationId: ORG, subscriptionId: subscription.id }, select: { status: true, eventType: true } }),
    );
    await fetch(`${BASE_URL}/api/cron/drain-feeds`, { headers: { "x-cron-secret": CRON_SECRET } }).catch(() => null);
    if (received.length === 0) await drainFeedDeliveries({ organizationId: ORG, limit: 10 });
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && received.length === 0) await new Promise((resolve) => setTimeout(resolve, 150));

    // Confirming again must NOT emit a second event: the transition is what matters, not the status being saved.
    await withOrganizationContext(ORG, (tx) => reviewObservation(ORG, observation.id, "CONFIRMED", ACTOR_ID, "verification: saved again"));
    const after = await withOrganizationContext(ORG, (tx) => tx.dataFeedDelivery.count({ where: { organizationId: ORG, subscriptionId: subscription.id } }));

    const event = received[0]?.body.event as Record<string, unknown> | undefined;
    console.log(`queued before drain: ${before === 0 ? "1 new" : `already ${before}`} · rows ${JSON.stringify(queued)}`);
    console.log(`received ${received.length} delivery(ies) · verified ${received.filter((entry) => entry.verified).length}`);
    console.log(`payload: ${JSON.stringify(event, null, 2)}`);
    console.log(`re-confirming produced ${after - queued.length} extra row(s)`);

    const problems: string[] = [];
    if (received.length !== 1) problems.push(`${received.length} deliveries, expected exactly 1`);
    if (!received[0]?.verified) problems.push("the delivery failed HMAC verification");
    if (!event) problems.push("no event payload");
    else {
      if (event.observationId !== observation.id) problems.push(`observationId ${String(event.observationId)} does not match`);
      if (event.confidence !== observation.confidence) problems.push("the AI confidence was not carried");
      if (!event.boundingBox) problems.push("the bounding box was not carried");
      if (event.reviewedById !== ACTOR_ID) problems.push("the reviewer was not carried");
      if (typeof event.reviewedAt !== "string") problems.push("no review timestamp");
      if (event.confirmedEventType !== (observation.eventCandidateType ?? null)) problems.push("confirmedEventType mismatch");
    }
    if (after !== queued.length) problems.push(`a second confirmation emitted ${after - queued.length} extra delivery(ies); only the transition should`);

    console.log("");
    console.log(problems.length === 0 ? "PASS: the confirmed observation reached the webhook once, HMAC-signed, with the AI box and the human decision" : `FAIL: ${problems.join("; ")}`);
    if (problems.length > 0) process.exitCode = 1;
  } finally {
    server.close();
    await withOrganizationContext(ORG, async (tx) => {
      await tx.dataFeedDelivery.deleteMany({ where: { subscriptionId: subscription.id } });
      await tx.dataFeedSubscription.deleteMany({ where: { id: subscription.id } });
      await tx.visionObservation.update({ where: { id: observation.id }, data: { status: "PENDING" } });
    });
    console.log("cleanup: subscription, deliveries and the observation's status restored");
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
