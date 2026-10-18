import { createServer } from "node:http";
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createGame } from "../src/server/scoring/createGame";
import { createGameEvent } from "../src/server/scoring/createGameEvent";
import { withGameWrite } from "../src/server/scoring/with-game-write";
import { drainFeedDeliveries } from "../src/lib/data-feed/dispatcher";
import { verifyWebhookSignature } from "../src/lib/data-feed/signature";

// Streak v5, Prompt 2 verification: pretend to be a sportsbook.
//
// Starts an HTTP receiver, registers a DataFeedSubscription pointing at it, then plays a short live game
// through the CANONICAL write path (createGameEvent inside withGameWrite) and drains the outbox. Every
// request is signature-verified with the subscription's secret - the same check a partner's SDK would do.
//
//   npx tsx scripts/data-feed-subscriber.ts --organization <orgId> --actor <userId> [--port 8099] \
//     [--events 3] [--keep] [--fixture <fixtureId>]
//
// --keep leaves the fixture/subscription in place for manual inspection; the default removes them so the
// database is left as it was found.
import { randomBytes } from "node:crypto";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const PORT = Number(arg("port") ?? 8099);
const EVENTS = Number(arg("events") ?? 3);
const KEEP = process.argv.includes("--keep");
const FIXTURE_ARG = arg("fixture");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: data-feed-subscriber.ts --organization <id> --actor <userId> [--port 8099] [--events 3] [--keep] [--fixture <id>]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;

type Received = { at: number; event: string | null; deliveryId: string | null; attempt: string | null; verified: boolean; reason?: string; body: Record<string, unknown> };

async function main() {
  const secret = `whsec_${randomBytes(16).toString("hex")}`;
  const received: Received[] = [];

  // ---- 1. the subscriber -------------------------------------------------------------------------
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const header = String(request.headers["x-ultra-signature"] ?? "");
      const verdict = verifyWebhookSignature(secret, body, header);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(body) as Record<string, unknown>;
      } catch {
        /* recorded as unverified */
      }
      received.push({
        at: Date.now(),
        event: String(request.headers["x-ultra-event"] ?? ""),
        deliveryId: String(request.headers["x-ultra-delivery-id"] ?? ""),
        attempt: String(request.headers["x-ultra-attempt"] ?? ""),
        verified: verdict.ok,
        reason: verdict.ok ? undefined : verdict.reason,
        body: parsed,
      });
      // Answer 200 only when the signature verified - a real partner should reject forgeries the same way.
      response.writeHead(verdict.ok ? 200 : 401, { "content-type": "application/json" });
      response.end(JSON.stringify({ received: verdict.ok }));
    });
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  console.log(`subscriber listening on http://127.0.0.1:${PORT}`);

  const webhookUrl = `http://127.0.0.1:${PORT}/hooks/ultra`;
  let subscriptionId: string | null = null;
  let fixtureId: string | null = FIXTURE_ARG ?? null;
  let createdFixture = false;

  try {
    // ---- 2. subscription -----------------------------------------------------------------------
    const subscription = await withOrganizationContext(ORG, (tx) =>
      tx.dataFeedSubscription.create({
        data: {
          organizationId: ORG,
          name: "Verification sportsbook (scripts/data-feed-subscriber.ts)",
          webhookUrl,
          secret,
          events: ["SCORE_CHANGED", "GAME_STARTED", "GAME_FINAL"],
          createdById: ACTOR_ID,
        },
        select: { id: true },
      }),
    );
    subscriptionId = subscription.id;
    console.log(`subscription ${subscription.id} -> ${webhookUrl}`);

    // ---- 3. a live game on the canonical path ---------------------------------------------------
    type FixtureContext = { id: string; homeSeasonClubId: string; awaySeasonClubId: string; homeName: string; awayName: string };
    const context = await withOrganizationContext(ORG, async (tx): Promise<FixtureContext> => {
      if (fixtureId) {
        const fixture = await tx.fixture.findFirstOrThrow({
          where: { id: fixtureId, organizationId: ORG },
          select: { id: true, homeSeasonClubId: true, awaySeasonClubId: true, homeSeasonClub: { select: { club: { select: { name: true } } } }, awaySeasonClub: { select: { club: { select: { name: true } } } } },
        });
        return {
          id: fixture.id,
          homeSeasonClubId: fixture.homeSeasonClubId!,
          awaySeasonClubId: fixture.awaySeasonClubId!,
          homeName: fixture.homeSeasonClub?.club.name ?? "Home",
          awayName: fixture.awaySeasonClub?.club.name ?? "Away",
        };
      }
      const season = await tx.season.findFirstOrThrow({ where: { organizationId: ORG }, orderBy: { startDate: "desc" }, select: { id: true } });
      // A Fixture needs a division and a venue; reuse the organization's existing ones rather than
      // inventing new reference data just for a test.
      const division = await tx.division.findFirst({ where: { organizationId: ORG }, select: { id: true } });
      const venue = await tx.venue.findFirst({ where: { organizationId: ORG }, select: { id: true } });
      if (!division || !venue) throw new Error("the organization needs at least one division and one venue for a verification fixture");
      const clubs = await tx.seasonClub.findMany({ where: { organizationId: ORG, seasonId: season.id }, take: 2, select: { id: true, club: { select: { name: true, shortName: true } } } });
      if (clubs.length < 2) throw new Error("the organization needs two season clubs for a verification fixture");
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
      createdFixture = true;
      return { id: fixture.id, homeSeasonClubId: clubs[0].id, awaySeasonClubId: clubs[1].id, homeName: clubs[0].club.name, awayName: clubs[1].club.name };
    });
    fixtureId = context.id;
    const game = await withOrganizationContext(ORG, (tx) =>
      createGame({ id: `feedtest_${Date.now()}`, fixtureId: context.id, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 600 }, { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }),
    );
    console.log(`fixture ${context.id} (${context.homeName} vs ${context.awayName}) · game ${game.id}`);

    const player = await withOrganizationContext(ORG, (tx) =>
      tx.player.findFirst({ where: { organizationId: ORG, seasonClubId: context.homeSeasonClubId }, select: { id: true, athlete: { select: { firstName: true, lastName: true } } } }),
    );

    // ---- 4. score N baskets through the canonical write path, draining after each -----------------
    for (let index = 1; index <= EVENTS; index += 1) {
      await withGameWrite(game.id, context.id, { actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }, async ({ tx }) => {
        await createGameEvent(
          {
            fixtureId: context.id,
            gameId: game.id,
            eventType: "SCORE",
            description: `Verification basket ${index}`,
            seasonClubId: context.homeSeasonClubId,
            playerId: player?.id ?? null,
            points: 2,
            basePointValue: 2,
            made: true,
            clockSeconds: 600 - index * 20,
          },
          { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" },
        );
      });
      const drained = await drainFeedDeliveries({ organizationId: ORG });
      console.log(`event ${index}: drained ${JSON.stringify(drained)}`);
    }

    // Give the receiver a moment to finish its last request.
    await new Promise((resolve) => setTimeout(resolve, 300));

    // ---- 5. verdict ----------------------------------------------------------------------------
    console.log("");
    console.log(`received ${received.length} webhook(s)`);
    for (const entry of received) {
      const game = entry.body.game as { homeScore?: number; awayScore?: number; status?: string } | undefined;
      const event = entry.body.event as { sequenceNumber?: number; points?: number } | undefined;
      console.log(`  ${entry.verified ? "VERIFIED" : `REJECTED (${entry.reason})`} · ${entry.event} · delivery ${entry.deliveryId} · attempt ${entry.attempt} · score ${game?.homeScore}-${game?.awayScore} · seq ${event?.sequenceNumber} (+${event?.points})`);
    }
    const bad = received.filter((entry) => !entry.verified).length;
    if (received.length === 0) {
      console.log("FAIL: no webhook arrived");
      process.exitCode = 1;
    } else if (bad > 0) {
      console.log(`FAIL: ${bad} unverified payload(s)`);
      process.exitCode = 1;
    } else {
      console.log("PASS: every payload was HMAC-verified by the subscriber");
    }

    // ---- 6. the outbox is empty (delivered, not pending) ---------------------------------------
    if (subscriptionId) {
      const state = await withOrganizationContext(ORG, (tx) =>
        tx.dataFeedDelivery.groupBy({ by: ["status"], where: { subscriptionId: subscriptionId! }, _count: { _all: true } }),
      );
      console.log(`outbox: ${state.map((row) => `${row.status}=${row._count._all}`).join(" ") || "empty"}`);
    }
  } finally {
    server.close();
    if (!KEEP) {
      await withOrganizationContext(ORG, async (tx) => {
        if (subscriptionId) await tx.dataFeedDelivery.deleteMany({ where: { subscriptionId } });
        if (subscriptionId) await tx.dataFeedSubscription.deleteMany({ where: { id: subscriptionId } });
        // Deleting the fixture cascades the game, its events and its stats.
        if (createdFixture && fixtureId) await tx.fixture.deleteMany({ where: { id: fixtureId } });
      }).catch((error) => console.error(`cleanup: ${error instanceof Error ? error.message : String(error)}`));
      console.log("cleanup: verification fixture and subscription removed (use --keep to keep them)");
    } else {
      console.log("--keep: fixture and subscription left in place");
    }
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
