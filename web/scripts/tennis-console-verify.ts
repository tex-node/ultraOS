import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createGame } from "../src/server/scoring/createGame";
import { applyScoringDelivery, type ScoringGamePayload } from "../src/server/scoring/applyScoringDelivery";
import { randomUUID } from "node:crypto";

// Streak v6, Prompt 2 verification: a full best-of-3 tennis match, every point an event, through the SAME
// code the console action runs (`applyScoringDelivery` - module resolution, point replay, ledger event,
// per-set GamePeriodScore, finalisation, winner, partner GAME_FINAL).
//
//   npx tsx scripts/tennis-console-verify.ts --organization <id> --actor <userId> [--keep]
//
// Sets are two games (GAMES_PER_SET=2) so the run is ~24 transactions instead of ~150; the set/match rules
// exercised are identical (win-by-two with a tiebreak at 3-2), and the realistic 6-game pilot lives in
// documentation/MULTI_SPORT_PILOT.md. The point this script proves is the PLUMBING: ledger -> period scores
// -> finalisation, which the short sets exercise just as well.

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: tennis-console-verify.ts --organization <id> --actor <userId> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;
const TAG = `TENNIS CONSOLE ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

async function loadGame(gameId: string): Promise<ScoringGamePayload> {
  return prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
      periodScores: { orderBy: { period: "asc" } },
      events: { select: { period: true, typeKey: true, seasonClubId: true, entrantId: true, sequenceNumber: true }, orderBy: { sequenceNumber: "asc" } },
    },
  });
}

async function playPoint(gameId: string, fixtureId: string, entrantId: string) {
  return withOrganizationContext(ORG, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fixture" WHERE id = ${fixtureId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: {
        fixture: { include: { division: { include: { competition: { include: { sport: true } } } } } },
        periodScores: { orderBy: { period: "asc" } },
        events: { select: { period: true, typeKey: true, seasonClubId: true, entrantId: true, sequenceNumber: true }, orderBy: { sequenceNumber: "asc" } },
      },
    });
    return applyScoringDelivery({ tx, organizationId: ORG, actorId: ACTOR_ID, fixtureId, game, input: { seasonClubId: entrantId, typeKey: "POINT" } });
  });
}

async function main() {
  const setup = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "tennis" }, select: { id: true } });
    const competition = await tx.competition.create({
      data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `tennis-console-${Date.now()}` },
      select: { id: true, slug: true },
    });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "Singles", slug: "singles" }, select: { id: true } });
    const season = await tx.season.create({
      data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) },
      select: { id: true },
    });
    // Short sets, best-of-3: SETS_TO_WIN=2 and GAMES_PER_SET=2.
    const ruleSet = await tx.ruleSet.create({
      data: { organizationId: ORG, name: `${TAG} rules`, seasonId: season.id, sportId: sport.id, config: { SETS_TO_WIN: 2, GAMES_PER_SET: 2, TIEBREAK_ENABLED: true } },
      select: { id: true },
    });
    const athletes = await tx.athlete.findMany({ where: { organizationId: ORG }, take: 2, select: { id: true, firstName: true, lastName: true } });
    if (athletes.length < 2) throw new Error("need two athletes");
    const entrants = [];
    for (const athlete of athletes) {
      const entrant = await tx.entrant.create({
        data: { organizationId: ORG, competitionId: competition.id, seasonId: season.id, divisionId: division.id, type: "INDIVIDUAL", name: `${athlete.firstName} ${athlete.lastName}` },
        select: { id: true, name: true },
      });
      await tx.entrantMember.create({ data: { organizationId: ORG, entrantId: entrant.id, athleteId: athlete.id } });
      entrants.push(entrant);
    }
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const fixture = await tx.fixture.create({
      data: {
        organizationId: ORG,
        seasonId: season.id,
        divisionId: division.id,
        venueId: venue.id,
        homeEntrantId: entrants[0].id,
        awayEntrantId: entrants[1].id,
        scheduledAt: new Date(),
        status: "SCHEDULED",
      },
      select: { id: true },
    });
    return { competition, division, season, ruleSet, entrants, fixtureId: fixture.id };
  });

  const game = await withOrganizationContext(ORG, (tx) =>
    createGame({ id: `console_${randomUUID().slice(0, 8)}`, fixtureId: setup.fixtureId, status: "LIVE", currentPeriod: 1 }, { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }),
  );
  await withOrganizationContext(ORG, (tx) => tx.fixture.update({ where: { id: setup.fixtureId }, data: { status: "LIVE" } }));
  console.log(`competition ${setup.competition.slug} · fixture ${setup.fixtureId} · game ${game.id}`);
  console.log(`${setup.entrants[0].name} v ${setup.entrants[1].name} · best of 3, sets to 2 games`);

  // Home takes set 1 (2-0), away takes set 2 (2-0), home takes the decider (2-0) -> 2-1. Each game is 4
  // points to 0, so every tap is a real POINT event and the deuce/advantage branch is covered separately by
  // the unit tests (a point won from 40-40 must still land on the same engine).
  const plan: ("HOME" | "AWAY")[] = [];
  const winsSet = (side: "HOME" | "AWAY") => {
    for (let gameNumber = 0; gameNumber < 2; gameNumber += 1) for (let point = 0; point < 4; point += 1) plan.push(side);
  };
  winsSet("HOME");
  winsSet("AWAY");
  winsSet("HOME");

  let points = 0;
  for (const side of plan) {
    const entrantId = side === "HOME" ? setup.entrants[0].id : setup.entrants[1].id;
    const result = await playPoint(game.id, setup.fixtureId, entrantId);
    points += 1;
    if (result.finalized) break;
  }

  const after = await loadGame(game.id);
  const sets = after.periodScores.map((row) => `${row.period}:${row.homeScore}-${row.awayScore}`).join(" ");
  console.log(`points captured: ${points}`);
  console.log(`fixture: ${after.fixture.status} ${after.fixture.homeScore}-${after.fixture.awayScore} winner=${after.fixture.winnerEntrantId ?? after.fixture.winnerSeasonClubId ?? "none"}`);
  console.log(`game: ${after.status} period=${after.currentPeriod}`);
  console.log(`GamePeriodScore (sets): ${sets}`);
  const ended = after.events.filter((event) => event.typeKey === "GAME_ENDED").length;

  const problems: string[] = [];
  if (after.fixture.status !== "FINAL") problems.push(`fixture is ${after.fixture.status}, expected FINAL`);
  if (after.status !== "FINAL") problems.push(`game is ${after.status}, expected FINAL`);
  if (after.fixture.homeScore !== 2 || after.fixture.awayScore !== 1) problems.push(`match score ${after.fixture.homeScore}-${after.fixture.awayScore}, expected 2-1`);
  if (after.fixture.winnerEntrantId !== setup.entrants[0].id) problems.push("winner is not the home entrant");
  if (after.periodScores.length !== 3) problems.push(`${after.periodScores.length} set row(s), expected 3`);
  if (ended !== 1) problems.push(`${ended} GAME_ENDED event(s), expected 1`);
  const deliveries = await withOrganizationContext(ORG, (tx) => tx.dataFeedDelivery.count({ where: { gameId: game.id } }));
  console.log(`partner GAME_FINAL deliveries queued: ${deliveries}`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: 3 sets, match winner, per-set scores and the ledger all agree" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
      await tx.entrant.deleteMany({ where: { seasonId: setup.season.id } });
      await tx.ruleSet.deleteMany({ where: { id: setup.ruleSet.id } });
      await tx.season.deleteMany({ where: { id: setup.season.id } });
      await tx.division.deleteMany({ where: { id: setup.division.id } });
      await tx.competition.deleteMany({ where: { id: setup.competition.id } });
    });
    console.log("cleanup: competition, season, entrants and fixture removed (use --keep to inspect)");
  } else {
    console.log(`--keep: competition ${setup.competition.id} (slug ${setup.competition.slug}) left in place`);
  }
}

main()
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
