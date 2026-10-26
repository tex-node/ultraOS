import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { applyScoringDelivery, type ScoringGamePayload } from "../src/server/scoring/applyScoringDelivery";
import { createGame } from "../src/server/scoring/createGame";
import { randomUUID } from "node:crypto";

// Streak v15, Prompt 2 verification: a tennis match played to completion, with the feed and the finalisation checked.
//
//   npx tsx scripts/tennis-verify.ts --organization <orgId> --actor <userId> [--keep]
//
// The two claims under test:
//   1. tennis emits SCORE_CHANGED (and therefore win-probability) deliveries, even though every rally carries
//      `points = 0` - the v14 stress test found it emitting nothing;
//   2. a finalised fixture has EXACTLY ONE winner column populated (a SeasonClub or an Entrant), because setting both
//      violates the foreign key (also found by the stress test).
//
// The match is short: a best-of-one-set, one-game format, so "to completion" means a few dozen rallies rather than a
// real two-hour match - the state machine is the same one.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: tennis-verify.ts --organization <id> --actor <userId> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;
const TAG = `TENNIS VERIFY ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

async function loadGame(gameId: string): Promise<ScoringGamePayload> {
  return prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
      periodScores: { orderBy: { period: "asc" } },
      ruleSnapshot: true,
      events: { select: { period: true, typeKey: true, sequenceNumber: true, seasonClubId: true, entrantId: true }, orderBy: { sequenceNumber: "asc" } },
    },
  });
}

async function main() {
  const setup = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "tennis" }, select: { id: true } });
    const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `tennis-verify-${Date.now()}` }, select: { id: true } });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "Open", slug: "open" }, select: { id: true } });
    const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const entrants = [];
    for (const name of ["Tennis Verify A", "Tennis Verify B"]) {
      const entrant = await tx.entrant.create({
        data: { organizationId: ORG, competitionId: competition.id, seasonId: season.id, divisionId: division.id, type: "INDIVIDUAL", name: `${name} ${randomUUID().slice(0, 3)}` },
        select: { id: true, name: true },
      });
      entrants.push(entrant);
    }
    const fixture = await tx.fixture.create({
      data: { organizationId: ORG, seasonId: season.id, divisionId: division.id, venueId: venue.id, scheduledAt: new Date(), status: "SCHEDULED", homeEntrantId: entrants[0].id, awayEntrantId: entrants[1].id },
      select: { id: true },
    });
    return { competitionId: competition.id, divisionId: division.id, seasonId: season.id, fixtureId: fixture.id, entrants };
  });

  // A subscriber, so the feed actually queues: without one every queue call returns early, and a test that reads
  // deliveries would measure its own missing subscription rather than the engine (which is what the first run did).
  const subscription = await withOrganizationContext(ORG, (tx) =>
    tx.dataFeedSubscription.create({
      data: {
        organizationId: ORG,
        createdById: ACTOR_ID,
        name: `${TAG} subscriber`,
        webhookUrl: "http://127.0.0.1:9/unreachable",
        secret: randomUUID().replace(/-/g, ""),
        events: ["SCORE_CHANGED", "WIN_PROBABILITY_UPDATED"],
        isActive: true,
      },
      select: { id: true },
    }),
  );

  const game = await withOrganizationContext(ORG, (tx) =>
    createGame({ id: `tennis_${randomUUID().slice(0, 8)}`, fixtureId: setup.fixtureId, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 0 }, { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }),
  );
  await withOrganizationContext(ORG, (tx) => tx.fixture.update({ where: { id: setup.fixtureId }, data: { status: "LIVE" } }));
  console.log(`tennis fixture ${setup.fixtureId} · game ${game.id}`);

  // Alternate the winner of each rally so the set actually reaches a conclusion (6 games, ties handled by the module).
  let state = await loadGame(game.id);
  let rallies = 0;
  const maxRallies = 400;
  while (state.status !== "FINAL" && rallies < maxRallies) {
    const side = rallies % 3 === 2 ? "away" : "home";
    const entrantId = side === "home" ? setup.entrants[0].id : setup.entrants[1].id;
    await withOrganizationContext(ORG, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${setup.fixtureId} FOR UPDATE`;
      const loaded = await loadGame(game.id);
      await applyScoringDelivery({
        tx,
        organizationId: ORG,
        actorId: ACTOR_ID,
        fixtureId: setup.fixtureId,
        game: loaded,
        input: { seasonClubId: entrantId, typeKey: "POINT" },
      });
    });
    state = await loadGame(game.id);
    rallies += 1;
  }
  console.log(`played ${rallies} rallies · game ${state.status} · fixture ${state.fixture.homeScore}-${state.fixture.awayScore}`);

  const deliveries = await withOrganizationContext(ORG, (tx) =>
    tx.dataFeedDelivery.findMany({ where: { gameId: game.id }, select: { eventType: true, eventData: true }, orderBy: { createdAt: "asc" } }),
  );
  const scoreChanges = deliveries.filter((row) => row.eventType === "SCORE_CHANGED");
  const probabilities = deliveries.filter((row) => row.eventType === "WIN_PROBABILITY_UPDATED");
  const fixture = await withOrganizationContext(ORG, (tx) =>
    tx.fixture.findUniqueOrThrow({ where: { id: setup.fixtureId }, select: { status: true, homeScore: true, awayScore: true, winnerSeasonClubId: true, winnerEntrantId: true } }),
  );

  console.log(`deliveries: ${scoreChanges.length} SCORE_CHANGED · ${probabilities.length} WIN_PROBABILITY_UPDATED`);
  console.log(`fixture: ${fixture.status} ${fixture.homeScore}-${fixture.awayScore} · winnerSeasonClubId=${fixture.winnerSeasonClubId ?? "null"} · winnerEntrantId=${fixture.winnerEntrantId ?? "null"}`);

  const problems: string[] = [];
  if (fixture.status !== "FINAL") problems.push(`the match did not finalise (${fixture.status}) after ${rallies} rallies`);
  if (scoreChanges.length === 0) problems.push("tennis emitted no SCORE_CHANGED delivery");
  if (probabilities.length === 0) problems.push("tennis emitted no WIN_PROBABILITY_UPDATED delivery");
  const winnerColumns = [fixture.winnerSeasonClubId, fixture.winnerEntrantId].filter(Boolean).length;
  if (winnerColumns !== 1) problems.push(`${winnerColumns} winner columns are populated, expected exactly 1`);
  if (fixture.winnerEntrantId === null) problems.push("an entrant fixture finished without winnerEntrantId");

  console.log("");
  console.log(problems.length === 0 ? `PASS: tennis finalised ${fixture.homeScore}-${fixture.awayScore} with ${scoreChanges.length} score deliveries and exactly one winner column` : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.dataFeedDelivery.deleteMany({ where: { gameId: game.id } });
      await tx.dataFeedSubscription.deleteMany({ where: { id: subscription.id } });
      await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
      await tx.entrant.deleteMany({ where: { seasonId: setup.seasonId } });
      await tx.season.deleteMany({ where: { id: setup.seasonId } });
      await tx.division.deleteMany({ where: { id: setup.divisionId } });
      await tx.competition.deleteMany({ where: { id: setup.competitionId } });
    });
    console.log("cleanup: tennis competition, entrants, fixture and its deliveries removed (use --keep to inspect)");
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
