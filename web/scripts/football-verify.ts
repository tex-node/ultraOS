import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";
import { createGame } from "../src/server/scoring/createGame";
import { createGameEvent } from "../src/server/scoring/createGameEvent";
import { applyScoringDelivery, type ScoringGamePayload } from "../src/server/scoring/applyScoringDelivery";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { randomUUID } from "node:crypto";

// Streak v10, Prompt 2 verification: a full football match - two goals, a yellow card, and a DRAW decided
// through the same paths the console uses.
//
//   npx tsx scripts/football-verify.ts --organization <orgId> --actor <userId> [--keep]
//
// The flow is the console's: applyScoringDelivery for the goals (the GOALS module), createGameEvent for the
// yellow card (the catalog panel's non-scoring path), and the finalisation the new DRAW mode performs - winner
// null, fixture FINAL, game FINAL - then recalculateStandings, which must award ONE point to each side.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: football-verify.ts --organization <id> --actor <userId> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;
const TAG = `FOOTBALL VERIFY ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

async function loadGame(gameId: string): Promise<ScoringGamePayload> {
  return prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
      periodScores: { orderBy: { period: "asc" } },
      ruleSnapshot: true,
      events: { select: { period: true, typeKey: true, seasonClubId: true, entrantId: true, sequenceNumber: true }, orderBy: { sequenceNumber: "asc" } },
    },
  });
}

async function main() {
  const definition = getSportDefinition("football");
  if (!definition) throw new Error("no football definition");
  const scoring = resolveScoringModule(definition);
  console.log(`football: ${definition.structure.periodCount} halves of ${definition.structure.periodDurationSeconds / 60} min · goals · draws allowed=${definition.scoring.drawsAllowed} · module=${scoring?.key}`);
  const points = definition.standings.primaryPoints;
  console.log(`standings: ${points.model} ${points.model === "WIN_DRAW_LOSS" ? `win=${points.win} draw=${points.draw} loss=${points.loss}` : ""}`);
  if (scoring?.key !== "FOOTBALL_GOALS") throw new Error(`expected the FOOTBALL_GOALS module, got ${scoring?.key}`);

  const setup = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "football" }, select: { id: true } });
    const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `football-verify-${Date.now()}` }, select: { id: true } });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "League", slug: "league" }, select: { id: true } });
    const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const sides = [];
    for (const [index, name] of ["Football Verify A", "Football Verify B"].entries()) {
      const club = await tx.club.create({ data: { organizationId: ORG, sportId: sport.id, name: `${name} ${randomUUID().slice(0, 4)}`, shortName: `F${index + 1}${randomUUID().slice(0, 3)}`.toUpperCase() }, select: { id: true } });
      const seasonClub = await tx.seasonClub.create({ data: { organizationId: ORG, seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
      sides.push(seasonClub.id);
    }
    const fixture = await tx.fixture.create({
      data: { organizationId: ORG, seasonId: season.id, divisionId: division.id, venueId: venue.id, homeSeasonClubId: sides[0], awaySeasonClubId: sides[1], scheduledAt: new Date(), status: "SCHEDULED" },
      select: { id: true },
    });
    return { competitionId: competition.id, divisionId: division.id, seasonId: season.id, fixtureId: fixture.id, sides };
  });

  const game = await withOrganizationContext(ORG, (tx) =>
    createGame({ id: `football_${randomUUID().slice(0, 8)}`, fixtureId: setup.fixtureId, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: definition.structure.periodDurationSeconds }, { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }),
  );
  await withOrganizationContext(ORG, (tx) => tx.fixture.update({ where: { id: setup.fixtureId }, data: { status: "LIVE" } }));
  console.log(`fixture ${setup.fixtureId} · game ${game.id} · clock ${game.clockSecondsRemaining}s`);

  // Goal for each side through the module (the console's Goal button).
  for (const side of [setup.sides[0], setup.sides[1]]) {
    const result = await withOrganizationContext(ORG, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${setup.fixtureId} FOR UPDATE`;
      const loaded = await loadGame(game.id);
      return applyScoringDelivery({ tx, organizationId: ORG, actorId: ACTOR_ID, fixtureId: setup.fixtureId, game: loaded, input: { seasonClubId: side, typeKey: "GOAL" } });
    });
    console.log(`  GOAL -> ${result.homeScore}-${result.awayScore} (finalize=${result.finalized})`);
  }

  // Yellow card through the catalog path (the SportCapturePanel's non-scoring event).
  await withOrganizationContext(ORG, (tx) =>
    createGameEvent(
      {
        gameId: game.id,
        fixtureId: setup.fixtureId,
        seasonClubId: setup.sides[0],
        eventType: "NOTE",
        typeKey: "YELLOW_CARD",
        period: 1,
        clockSeconds: 420,
        description: "Yellow card — verification",
      },
      { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" },
    ),
  );
  console.log("  YELLOW_CARD recorded");

  // The DRAW finalisation the new mode performs (winner null, terminal event first, then the flips).
  await withOrganizationContext(ORG, async (tx) => {
    await createGameEvent(
      { gameId: game.id, fixtureId: setup.fixtureId, eventType: "GAME_ENDED", typeKey: "GAME_ENDED", period: 2, clockSeconds: 0, description: "Final 1–1 (draw)" },
      { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" },
    );
    await tx.fixture.update({ where: { id: setup.fixtureId }, data: { status: "FINAL", winnerSeasonClubId: null } });
    await tx.game.update({ where: { id: game.id }, data: { status: "FINAL", currentPeriod: 2, clockSecondsRemaining: 0, endedAt: new Date() } });
    await recalculateStandings(tx, ORG, setup.seasonId);
  });

  const after = await loadGame(game.id);
  const standings = await withOrganizationContext(ORG, (tx) =>
    tx.standing.findMany({
      where: { seasonId: setup.seasonId },
      include: { seasonClub: { select: { club: { select: { name: true } } } } },
      orderBy: { rank: "asc" },
    }),
  );
  const cards = after.events.filter((event) => event.typeKey === "YELLOW_CARD").length;
  console.log("");
  console.log(`fixture: ${after.fixture.status} ${after.fixture.homeScore}-${after.fixture.awayScore} winner=${after.fixture.winnerSeasonClubId ?? "none"}`);
  console.log(`game: ${after.status} period=${after.currentPeriod} · yellow card events=${cards}`);
  console.log("standings:");
  for (const row of standings) {
    console.log(`  ${row.seasonClub?.club.name ?? "?"} rank=${row.rank} W${row.won} D${row.drawn} L${row.lost} pts=${row.leaguePoints}`);
  }

  const problems: string[] = [];
  if (after.fixture.status !== "FINAL") problems.push(`fixture is ${after.fixture.status}`);
  if (after.status !== "FINAL") problems.push(`game is ${after.status}`);
  if (after.fixture.homeScore !== 1 || after.fixture.awayScore !== 1) problems.push(`score ${after.fixture.homeScore}-${after.fixture.awayScore}, expected 1-1`);
  if (after.fixture.winnerSeasonClubId !== null) problems.push("a drawn match has a winner");
  if (cards !== 1) problems.push(`${cards} yellow card event(s), expected 1`);
  if (standings.length !== 2) problems.push(`${standings.length} standing rows, expected 2`);
  for (const row of standings) {
    if (row.drawn !== 1) problems.push(`${row.seasonClub?.club.name} drawn=${row.drawn}, expected 1`);
    if (row.leaguePoints !== 1) problems.push(`${row.seasonClub?.club.name} leaguePoints=${row.leaguePoints}, expected 1`);
    if (row.won !== 0 || row.lost !== 0) problems.push(`${row.seasonClub?.club.name} W${row.won} L${row.lost}, expected 0/0`);
  }

  console.log("");
  console.log(problems.length === 0 ? "PASS: a 90-minute draw awards one point each, with the goal and card recorded" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.standing.deleteMany({ where: { seasonId: setup.seasonId } });
      await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
      await tx.season.deleteMany({ where: { id: setup.seasonId } });
      await tx.division.deleteMany({ where: { id: setup.divisionId } });
      await tx.competition.deleteMany({ where: { id: setup.competitionId } });
      await tx.club.deleteMany({ where: { organizationId: ORG, name: { startsWith: "Football Verify" } } });
    });
    console.log("cleanup: football competition, clubs, fixture and standings removed (use --keep to inspect)");
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
