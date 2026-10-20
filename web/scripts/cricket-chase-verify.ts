import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { applyScoringDelivery, type ScoringGamePayload } from "../src/server/scoring/applyScoringDelivery";
import { createGame } from "../src/server/scoring/createGame";
import { randomUUID } from "node:crypto";

// Streak v12, Prompt 1a: a full 20-over cricket chase, driven through the same delivery path the console uses.
//
//   npx tsx scripts/cricket-chase-verify.ts --organization <orgId> --actor <userId> [--keep]
//
// The point is the CHASE, not the score: team B must be declared the winner the moment it passes team A's total,
// with overs still to spare, and the standings must record the win without any operator intervention. The script
// asserts all three (winner, fixture FINAL, overs remaining > 0) and prints the innings as it goes.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: cricket-chase-verify.ts --organization <id> --actor <userId> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;
const TAG = `CRICKET CHASE ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

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

async function deliver(gameId: string, fixtureId: string, seasonClubId: string, typeKey: string) {
  return withOrganizationContext(ORG, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const loaded = await loadGame(gameId);
    return applyScoringDelivery({
      tx,
      organizationId: ORG,
      actorId: ACTOR_ID,
      fixtureId,
      game: loaded,
      input: { seasonClubId, typeKey },
    });
  });
}

async function main() {
  const setup = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "cricket" }, select: { id: true } });
    const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `cricket-verify-${Date.now()}` }, select: { id: true } });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "League", slug: "league" }, select: { id: true } });
    const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const clubs = [];
    for (const [index, name] of ["Cricket Verify A", "Cricket Verify B"].entries()) {
      const club = await tx.club.create({ data: { organizationId: ORG, sportId: sport.id, name: `${name} ${randomUUID().slice(0, 4)}`, shortName: `C${index + 1}${randomUUID().slice(0, 3)}`.toUpperCase() }, select: { id: true } });
      const seasonClub = await tx.seasonClub.create({ data: { organizationId: ORG, seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
      clubs.push(seasonClub.id);
    }
    const fixture = await tx.fixture.create({
      data: { organizationId: ORG, seasonId: season.id, divisionId: division.id, venueId: venue.id, homeSeasonClubId: clubs[0], awaySeasonClubId: clubs[1], scheduledAt: new Date(), status: "SCHEDULED" },
      select: { id: true },
    });
    return { competitionId: competition.id, divisionId: division.id, seasonId: season.id, fixtureId: fixture.id, home: clubs[0], away: clubs[1] };
  });

  const game = await withOrganizationContext(ORG, (tx) =>
    createGame({ id: `cricket_${randomUUID().slice(0, 8)}`, fixtureId: setup.fixtureId, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 0 }, { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }),
  );
  await withOrganizationContext(ORG, (tx) => tx.fixture.update({ where: { id: setup.fixtureId }, data: { status: "LIVE" } }));
  console.log(`cricket fixture ${setup.fixtureId} · game ${game.id} · 2 innings x 20 overs`);

  // A deterministic but varied sequence of legal deliveries: dot, single, boundary, six. Every value maps to exactly
  // one delivery whose point value comes from the definition - the first version delivered a RUN for the "dot" and
  // then a DOT_BALL on top of it, which scored a run on every dot ball.
  const runPlan: { typeKey: string; runs: number }[] = [
    { typeKey: "RUN", runs: 1 },
    { typeKey: "DOT_BALL", runs: 0 },
    { typeKey: "RUN", runs: 1 },
    { typeKey: "FOUR", runs: 4 },
    { typeKey: "DOT_BALL", runs: 0 },
    { typeKey: "RUN", runs: 1 },
    { typeKey: "SIX", runs: 6 },
    { typeKey: "RUN", runs: 1 },
    { typeKey: "DOT_BALL", runs: 0 },
    { typeKey: "FOUR", runs: 4 },
  ];
  let ball = 0;
  let state = await loadGame(game.id);

  console.log("\ninnings 1 - home batting");
  for (let over = 1; over <= 20; over += 1) {
    for (let delivery = 1; delivery <= 6; delivery += 1) {
      if (state.status === "FINAL") break;
      const plan = runPlan[ball % runPlan.length];
      await deliver(game.id, setup.fixtureId, setup.home, plan.typeKey);
      state = await loadGame(game.id);
      ball += 1;
      void delivery;
    }
    if (state.status === "FINAL") break;
    console.log(`  over ${String(over).padStart(2)}: ${gameScore(state)}`);
  }
  const firstInnings = state.fixture.homeScore;
  console.log(`innings 1 total: ${firstInnings} · target for the chase: ${firstInnings + 1}`);

  console.log("\ninnings 2 - away chasing");
  let chaseBall = 0;
  for (let over = 1; over <= 20; over += 1) {
    for (let delivery = 1; delivery <= 6; delivery += 1) {
      if (state.status === "FINAL") break;
      const plan = runPlan[chaseBall % runPlan.length];
      await deliver(game.id, setup.fixtureId, setup.away, plan.typeKey);
      state = await loadGame(game.id);
      chaseBall += 1;
      if (state.status === "FINAL") {
        console.log(`  chase completed in over ${over}, ball ${delivery}: ${gameScore(state)}`);
        break;
      }
    }
    if (state.status === "FINAL") break;
    console.log(`  over ${String(over).padStart(2)}: ${gameScore(state)}`);
  }

  const standings = await withOrganizationContext(ORG, (tx) =>
    tx.standing.findMany({
      where: { seasonId: setup.seasonId },
      include: { seasonClub: { select: { club: { select: { name: true } }, id: true } } },
      orderBy: { rank: "asc" },
    }),
  );

  console.log("");
  console.log(`fixture: ${state.fixture.status} ${state.fixture.homeScore}-${state.fixture.awayScore} winner=${state.fixture.winnerSeasonClubId === setup.home ? "HOME" : state.fixture.winnerSeasonClubId === setup.away ? "AWAY" : "none"}`);
  console.log(`game: ${state.status}`);
  for (const row of standings) {
    console.log(`  ${row.seasonClub?.club.name ?? "?"} rank=${row.rank} W${row.won} L${row.lost} pts=${row.leaguePoints}`);
  }

  const problems: string[] = [];
  const winnerIsAway = state.fixture.winnerSeasonClubId === setup.away;
  if (state.status !== "FINAL") problems.push(`game is ${state.status}, not FINAL`);
  if (state.fixture.status !== "FINAL") problems.push(`fixture is ${state.fixture.status}, not FINAL`);
  if (!winnerIsAway) problems.push("the chasing side did not win");
  if (state.fixture.awayScore < firstInnings + 1) problems.push(`chase total ${state.fixture.awayScore} did not pass the target ${firstInnings + 1}`);
  if (chaseBall > 120) problems.push(`the chase used ${chaseBall} balls, more than a full innings`);
  const awayRow = standings.find((row) => row.seasonClub?.id === setup.away);
  const homeRow = standings.find((row) => row.seasonClub?.id === setup.home);
  if (awayRow?.won !== 1) problems.push(`chasing side standings W=${awayRow?.won}, expected 1`);
  if (homeRow?.lost !== 1) problems.push(`batting side standings L=${homeRow?.lost}, expected 1`);

  console.log("");
  console.log(problems.length === 0 ? `PASS: the chase ended the game at ${state.fixture.awayScore} chasing ${firstInnings}, with the win in the standings` : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.standing.deleteMany({ where: { seasonId: setup.seasonId } });
      await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
      await tx.season.deleteMany({ where: { id: setup.seasonId } });
      await tx.division.deleteMany({ where: { id: setup.divisionId } });
      await tx.competition.deleteMany({ where: { id: setup.competitionId } });
      await tx.club.deleteMany({ where: { organizationId: ORG, name: { startsWith: "Cricket Verify" } } });
    });
    console.log("cleanup: cricket competition, clubs, fixture and standings removed (use --keep to inspect)");
  }
}

function gameScore(state: ScoringGamePayload): string {
  return `${state.fixture.homeScore}-${state.fixture.awayScore}`;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
