import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { queueGameLifecycleFeed } from "../src/lib/data-feed/dispatcher";
import { verifyWebhookSignature } from "../src/lib/data-feed/signature";
import { createGame } from "../src/server/scoring/createGame";

// Streak v6, Prompt 1 verification: GAME_STARTED / GAME_FINAL reach a subscriber THROUGH THE CRON TIMER.
//
//   npx tsx scripts/feed-lifecycle-verify.ts --organization <id> --actor <userId> [--port 8098] [--wait 45]
//
// The two lifecycle events are queued with the same call the app actions make (`queueGameLifecycleFeed`,
// inside the transaction that flips the fixture), and are then delivered by whatever the host's timer does -
// this script does NOT drain explicitly. That is the point: it proves delivery no longer depends on new
// scoring. The action wiring itself (8 lines in startGame / recordScoringEvent) is reviewed in code; a server
// action cannot be invoked from a script without a browser session.
import { randomUUID } from "node:crypto";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const PORT = Number(arg("port") ?? 8098);
const WAIT_SECONDS = Number(arg("wait") ?? 45);
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: feed-lifecycle-verify.ts --organization <id> --actor <userId> [--port 8098] [--wait 45]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;

type Received = { event: string | null; verified: boolean; reason?: string; body: Record<string, unknown> };

async function main() {
  const secret = `whsec_${randomBytes(16).toString("hex")}`;
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const verdict = verifyWebhookSignature(secret, raw, String(request.headers["x-ultra-signature"] ?? ""));
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        /* unverified */
      }
      received.push({ event: String(request.headers["x-ultra-event"] ?? ""), verified: verdict.ok, reason: verdict.ok ? undefined : verdict.reason, body });
      response.writeHead(verdict.ok ? 200 : 401, { "content-type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  console.log(`subscriber on http://127.0.0.1:${PORT}`);

  let subscriptionId: string | null = null;
  let fixtureId: string | null = null;
  try {
    subscriptionId = (
      await withOrganizationContext(ORG, (tx) =>
        tx.dataFeedSubscription.create({
          data: {
            organizationId: ORG,
            name: "Lifecycle verification (scripts/feed-lifecycle-verify.ts)",
            webhookUrl: `http://127.0.0.1:${PORT}/hooks`,
            secret,
            events: ["GAME_STARTED", "GAME_FINAL"],
            createdById: ACTOR_ID,
          },
          select: { id: true },
        }),
      )
    ).id;

    const context = await withOrganizationContext(ORG, async (tx) => {
      const season = await tx.season.findFirstOrThrow({ where: { organizationId: ORG }, orderBy: { startDate: "desc" }, select: { id: true } });
      const division = await tx.division.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
      const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
      const clubs = await tx.seasonClub.findMany({ where: { organizationId: ORG, seasonId: season.id }, take: 2, select: { id: true, club: { select: { name: true } } } });
      if (clubs.length < 2) throw new Error("need two season clubs");
      const fixture = await tx.fixture.create({
        data: {
          organizationId: ORG,
          seasonId: season.id,
          divisionId: division.id,
          venueId: venue.id,
          homeSeasonClubId: clubs[0].id,
          awaySeasonClubId: clubs[1].id,
          scheduledAt: new Date(),
          status: "SCHEDULED",
        },
        select: { id: true },
      });
      return { fixtureId: fixture.id, home: clubs[0].club.name, away: clubs[1].club.name };
    });
    fixtureId = context.fixtureId;
    const game = await withOrganizationContext(ORG, (tx) =>
      createGame({ id: `lifecycle_${randomUUID().slice(0, 8)}`, fixtureId: context.fixtureId, status: "LIVE" }, { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }),
    );
    console.log(`fixture ${context.fixtureId} (${context.home} v ${context.away}) · game ${game.id}`);

    // Queue both lifecycle events exactly as the actions do; no explicit drain afterwards.
    await withOrganizationContext(ORG, async (tx) => {
      await queueGameLifecycleFeed(tx, {
        organizationId: ORG,
        gameId: game.id,
        eventType: "GAME_STARTED",
        event: { eventId: game.id, sequenceNumber: game.nextEventSequence, period: game.currentPeriod, clockSeconds: game.clockSecondsRemaining, points: null, eventType: "GAME_STARTED" },
      });
      await tx.fixture.update({ where: { id: context.fixtureId }, data: { status: "FINAL", homeScore: 21, awayScore: 18 } });
      await tx.game.update({ where: { id: game.id }, data: { status: "FINAL", endedAt: new Date() } });
      await queueGameLifecycleFeed(tx, {
        organizationId: ORG,
        gameId: game.id,
        eventType: "GAME_FINAL",
        event: { eventId: game.id, sequenceNumber: game.nextEventSequence, period: game.currentPeriod, clockSeconds: 0, points: null, eventType: "GAME_FINAL" },
      });
    });
    console.log(`queued GAME_STARTED + GAME_FINAL; waiting up to ${WAIT_SECONDS}s for the host's timer to drain`);

    const deadline = Date.now() + WAIT_SECONDS * 1000;
    while (Date.now() < deadline && received.length < 2) await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`received ${received.length} webhook(s)`);
    for (const entry of received) {
      const game = entry.body.game as { homeScore?: number; awayScore?: number; status?: string } | undefined;
      console.log(`  ${entry.verified ? "VERIFIED" : `REJECTED (${entry.reason})`} · ${entry.event} · status ${game?.status} · ${game?.homeScore}-${game?.awayScore}`);
    }
    const types = new Set(received.map((entry) => entry.event));
    const bad = received.filter((entry) => !entry.verified);
    if (bad.length > 0) {
      console.log(`FAIL: ${bad.length} unverified payload(s)`);
      process.exitCode = 1;
    } else if (!types.has("GAME_STARTED") || !types.has("GAME_FINAL")) {
      console.log(`FAIL: expected GAME_STARTED and GAME_FINAL, got ${[...types].join(",") || "nothing"} (is the timer installed and CRON_SECRET set?)`);
      process.exitCode = 1;
    } else {
      console.log("PASS: both lifecycle events were delivered by the cron timer and HMAC-verified");
    }
  } finally {
    server.close();
    await withOrganizationContext(ORG, async (tx) => {
      if (subscriptionId) await tx.dataFeedDelivery.deleteMany({ where: { subscriptionId } });
      if (subscriptionId) await tx.dataFeedSubscription.deleteMany({ where: { id: subscriptionId } });
      if (fixtureId) await tx.fixture.deleteMany({ where: { id: fixtureId } });
    }).catch((error) => console.error(`cleanup: ${error instanceof Error ? error.message : String(error)}`));
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
