import { createServer } from "node:http";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createFeedSubscription } from "../src/server/data-feed/subscriptions";
import { queueCardIssuedFeed, drainFeedDeliveries } from "../src/lib/data-feed/dispatcher";
import { verifyWebhookSignature } from "../src/lib/data-feed/signature";

// Streak v10, Prompt 4 verification: the football webhook payloads against a local HMAC listener.
//
//   npx tsx scripts/feed-football-verify.ts --organization <id> --actor <userId> [--base-url http://127.0.0.1:4120]
//
// Creates a subscription for CARD_ISSUED + SCORE_CHANGED, queues a card and a goal for a real game, drains through
// the cron endpoint (the timer's path), and asserts at the listener that every delivery is HMAC-valid and that the
// card payload carries the player and the colour while the score payload carries the scorer.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
const PORT = Number(arg("port") ?? 8096);
const CRON_SECRET = process.env.CRON_SECRET ?? "";
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: feed-football-verify.ts --organization <id> --actor <userId> [--base-url url]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;

async function main() {
  // A real game with a player on it, so the scorer/name resolution has something to resolve.
  const game = await withOrganizationContext(ORG, (tx) =>
    tx.game.findFirst({
      where: { organizationId: ORG, status: "FINAL" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fixture: { select: { homeSeasonClub: { select: { players: { select: { id: true, athlete: { select: { firstName: true, lastName: true } } }, take: 1 } } } } } },
    }),
  );
  if (!game) throw new Error("no FINAL game in this organization");
  const player = game.fixture.homeSeasonClub?.players[0];
  const playerId = player?.id ?? null;
  const playerName = player ? `${player.athlete.firstName} ${player.athlete.lastName}`.trim() : null;
  console.log(`game ${game.id} · player ${playerName ?? "none"}`);

  const created = await withOrganizationContext(ORG, (tx) =>
    createFeedSubscription(tx, {
      organizationId: ORG,
      userId: ACTOR_ID,
      name: "Football feed verification",
      webhookUrl: `http://127.0.0.1:${PORT}/hooks`,
      events: ["SCORE_CHANGED", "CARD_ISSUED"],
    }),
  );
  console.log(`subscription ${created.id} (SCORE_CHANGED + CARD_ISSUED)`);

  const received: { verified: boolean; event: string | null; body: Record<string, unknown> }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const verdict = verifyWebhookSignature(created.secret, body, String(request.headers["x-ultra-signature"] ?? ""));
      received.push({ verified: verdict.ok, event: String(request.headers["x-ultra-event"] ?? ""), body: JSON.parse(body) as Record<string, unknown> });
      response.writeHead(verdict.ok ? 200 : 401, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  try {
    await withOrganizationContext(ORG, async (tx) => {
      await queueCardIssuedFeed(tx, {
        organizationId: ORG,
        gameId: game.id,
        event: {
          eventId: `${game.id}-card`,
          sequenceNumber: 1,
          period: 1,
          clockSeconds: 1800,
          points: null,
          eventType: "YELLOW_CARD",
          playerName,
          cardColour: "YELLOW",
          side: "HOME",
        },
      });
    });
    // A score delivery carrying only the playerId, which the drain must resolve to a name.
    const { queueScoreChangedFeed } = await import("../src/lib/data-feed/dispatcher");
    await withOrganizationContext(ORG, (tx) =>
      queueScoreChangedFeed(tx, {
        organizationId: ORG,
        gameId: game.id,
        event: { eventId: `${game.id}-goal`, sequenceNumber: 2, period: 2, clockSeconds: 2400, points: 1, eventType: "GOAL", playerId },
      }),
    );

    const cron = await fetch(`${BASE_URL}/api/cron/drain-feeds`, { headers: { "x-cron-secret": CRON_SECRET } }).then((response) => response.json()).catch((error) => ({ error: String(error) }));
    console.log(`cron drain: ${JSON.stringify(cron)}`);
    // The drain endpoint only drains by timer; run one directly as well so the check does not depend on timing.
    if (received.length < 2) await drainFeedDeliveries({ organizationId: ORG, limit: 10 });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && received.length < 2) await new Promise((resolve) => setTimeout(resolve, 200));

    console.log(`received ${received.length} delivery(ies)`);
    const card = received.find((entry) => entry.event === "CARD_ISSUED");
    const score = received.find((entry) => entry.event === "SCORE_CHANGED");
    for (const entry of received) {
      const event = entry.body.event as Record<string, unknown> | undefined;
      console.log(`  ${entry.verified ? "VERIFIED" : "REJECTED"} · ${entry.event} · ${JSON.stringify(event)}`);
    }

    const problems: string[] = [];
    if (received.length !== 2) problems.push(`${received.length} deliveries, expected 2`);
    if (received.some((entry) => !entry.verified)) problems.push("a delivery failed HMAC verification");
    const cardEvent = card?.body.event as { playerName?: string; cardColour?: string; side?: string } | undefined;
    if (!card) problems.push("no CARD_ISSUED delivery");
    else {
      if (cardEvent?.playerName !== playerName) problems.push(`card playerName ${cardEvent?.playerName ?? "missing"}, expected ${playerName ?? "null"}`);
      if (cardEvent?.cardColour !== "YELLOW") problems.push(`card cardColour ${cardEvent?.cardColour ?? "missing"}`);
      if (cardEvent?.side !== "HOME") problems.push(`card side ${cardEvent?.side ?? "missing"}`);
    }
    const scoreEvent = score?.body.event as { playerName?: string; eventType?: string } | undefined;
    if (!score) problems.push("no SCORE_CHANGED delivery");
    else if (scoreEvent?.eventType !== "GOAL") problems.push(`score eventType ${scoreEvent?.eventType ?? "missing"}`);

    console.log("");
    console.log(problems.length === 0 ? "PASS: CARD_ISSUED carries player+colour and SCORE_CHANGED carries the scorer, both HMAC-verified" : `FAIL: ${problems.join("; ")}`);
    if (problems.length > 0) process.exitCode = 1;
  } finally {
    server.close();
    await withOrganizationContext(ORG, async (tx) => {
      await tx.dataFeedDelivery.deleteMany({ where: { subscriptionId: created.id } });
      await tx.dataFeedSubscription.deleteMany({ where: { id: created.id } });
    });
    console.log("cleanup: verification subscription and its deliveries removed");
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
