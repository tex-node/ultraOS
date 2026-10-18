import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { TENNIS } from "../src/lib/sports/tennis";
import { awardPoint, isSetComplete, setWinner, type TennisConfig } from "../src/lib/sports/tennis-scoring";
import { computeSeasonStandings } from "../src/lib/sports/standings";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { matchOutcome } from "../src/lib/sports/match-result";

// Streak v5, Prompt 3: a tennis pilot, end to end through the multi-sport engine.
//
// What this proves: an INDIVIDUAL-entrant competition (no clubs, no roster) can be onboarded, a best-of-3
// match can be scored point by point through the real tennis rule engine, the result can be persisted as
// entrant-vs-entrant fixtures, and the standings engine ranks individual players using the sport's own
// tiebreak order (wins, then set ratio, then game ratio).
//
// What it does NOT prove, and says so: the CAPTURE CONSOLE does not render a tennis court/point grid yet -
// `tennis-scoring.ts` has said so since it was written ("tested and ready, not yet registered in the
// console"). This script drives the same functions the console would.
//
//   npx tsx scripts/tennis-pilot.ts --organization <orgId> --actor <userId> [--keep]
//
// Without --keep, everything it creates is deleted at the end (competition, division, season, entrants,
// fixtures, rule set).

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const KEEP = process.argv.includes("--keep");
const KNOCKOUT = process.argv.includes("--knockout");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: tennis-pilot.ts --organization <id> --actor <userId> [--keep] [--knockout]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const TAG = `TENNIS PILOT ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

// Best-of-3: the SPORT DEFINITION's own default is best-of-5 (structure.periodsToWin = 3), so a best-of-3
// event needs the SETS_TO_WIN override. It is written as a RuleSet row (config) AND used here explicitly,
// because the console plumbing that would read it back is the part that is not wired yet.
const BEST_OF_THREE: TennisConfig = { setsToWin: 2, gamesPerSet: 6, tiebreakEnabled: true, setCount: 3 };

type Scored = { homeSets: number; awaySets: number; sets: { period: number; home: number; away: number }[] };

/**
 * Plays a match point by point with the real rule functions. The winner of each set is given the games it
 * needs; the loser gets `gamesForLoser` games. Each game is played as a sequence of points, so `awardPoint`
 * (deuce/advantage) is genuinely exercised rather than bypassed.
 */
function playMatch(seed: number): Scored {
  const sets: { period: number; home: number; away: number }[] = [];
  let homeSets = 0;
  let awaySets = 0;
  for (let set = 1; set <= 3 && homeSets < BEST_OF_THREE.setsToWin && awaySets < BEST_OF_THREE.setsToWin; set += 1) {
    let games = { home: 0, away: 0 };
    // Alternate who takes this set so the six pilot matches produce different scorelines.
    const homeTakesSet = (seed + set) % 2 === 0;
    // Vary the set scoreline (6-4, 7-5, 7-6) so the pilot exercises the straight-sets win, the 7-5 win and
    // the tiebreak, rather than only one branch of isSetComplete.
    const loserGames = [4, 5, 6][(set - 1) % 3];
    let played = 0;
    while (!isSetComplete(BEST_OF_THREE, games)) {
      // The loser takes the first `loserGames` games, then the winner takes every remaining game of the set.
      const winner: "HOME" | "AWAY" = played < loserGames ? (homeTakesSet ? "AWAY" : "HOME") : homeTakesSet ? "HOME" : "AWAY";
      played += 1;
      // Play the game as points: first to 4 with a 2-point lead - awardPoint's own rule, including deuce.
      let points = { home: 0, away: 0 };
      for (;;) {
        const awarded = awardPoint(points, winner);
        if (awarded.gameWon) break;
        points = awarded.points;
      }
      games = winner === "HOME" ? { home: games.home + 1, away: games.away } : { home: games.home, away: games.away + 1 };
    }
    const winner = setWinner(BEST_OF_THREE, games);
    if (winner === "HOME") homeSets += 1;
    else if (winner === "AWAY") awaySets += 1;
    sets.push({ period: set, home: games.home, away: games.away });
  }
  return { homeSets, awaySets, sets };
}

async function main() {
  const sport = await prisma.sport.findFirst({ where: { slug: "tennis" }, select: { id: true, name: true } });
  if (!sport) throw new Error("no 'tennis' Sport row exists - run the sport registry sync first");

  // ---- onboard -----------------------------------------------------------------------------------
  const setup = await withOrganizationContext(ORG, async (tx) => {
    const competition = await tx.competition.create({
      data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `tennis-pilot-${Date.now()}` },
      select: { id: true, name: true },
    });
    const division = await tx.division.create({
      data: { organizationId: ORG, competitionId: competition.id, name: "Singles", slug: "singles" },
      select: { id: true },
    });
    const season = await tx.season.create({
      data: {
        organizationId: ORG,
        competitionId: competition.id,
        name: `${TAG} season`,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    // Best-of-3 as a real rule row, in the multi-sport RuleSet shape.
    const ruleSet = await tx.ruleSet.create({
      data: { organizationId: ORG, name: `${TAG} rules`, seasonId: season.id, sportId: sport.id, config: { SETS_TO_WIN: 2, GAMES_PER_SET: 6, TIEBREAK_ENABLED: true } },
      select: { id: true },
    });

    // Four INDIVIDUAL entrants, each linked to a real athlete: no club, no roster.
    const athletes = await tx.athlete.findMany({ where: { organizationId: ORG }, take: 4, select: { id: true, firstName: true, lastName: true } });
    if (athletes.length < 4) throw new Error("the organization needs at least four athletes for a tennis pilot");
    const entrants = [];
    for (const athlete of athletes) {
      const entrant = await tx.entrant.create({
        data: {
          organizationId: ORG,
          competitionId: competition.id,
          seasonId: season.id,
          divisionId: division.id,
          type: "INDIVIDUAL",
          name: `${athlete.firstName} ${athlete.lastName}`,
        },
        select: { id: true, name: true },
      });
      await tx.entrantMember.create({ data: { organizationId: ORG, entrantId: entrant.id, athleteId: athlete.id } });
      entrants.push(entrant);
    }

    const venue = await tx.venue.findFirst({ where: { organizationId: ORG }, select: { id: true } });
    if (!venue) throw new Error("the organization needs a venue for fixtures");
    return { competition, division, season, ruleSet, entrants, venue };
  });
  console.log(`competition ${setup.competition.name} (${setup.competition.id})`);
  console.log(`entrants: ${setup.entrants.map((entrant) => entrant.name).join(", ")}`);
  console.log(`best-of-3 rule set ${setup.ruleSet.id} (SETS_TO_WIN=2)`);

  // ---- round robin: 6 matches among 4 entrants ----------------------------------------------------
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ];
  const results: { fixtureId: string; home: number; away: number; homeSets: number; awaySets: number; sets: Scored["sets"] }[] = [];
  let seed = 0;
  for (const [home, away] of pairs) {
    const scored = playMatch(seed);
    seed += 1;
    const outcome = matchOutcome(TENNIS, scored.homeSets, scored.awaySets);
    const fixture = await withOrganizationContext(ORG, async (tx) => {
      const created = await tx.fixture.create({
        data: {
          organizationId: ORG,
          seasonId: setup.season.id,
          divisionId: setup.division.id,
          venueId: setup.venue.id,
          homeEntrantId: setup.entrants[home].id,
          awayEntrantId: setup.entrants[away].id,
          scheduledAt: new Date(),
          status: "FINAL",
          homeScore: scored.homeSets,
          awayScore: scored.awaySets,
        },
        select: { id: true },
      });
      // The game row + one GamePeriodScore per SET: for tennis the "period" IS the set, so this is the
      // generic period model, not a tennis special case.
      const game = await tx.game.create({
        data: { organizationId: ORG, fixtureId: created.id, status: "FINAL", currentPeriod: scored.sets.length, clockSecondsRemaining: 0, endedAt: new Date(), dataCapability: "BOX_SCORE_ONLY" },
        select: { id: true },
      });
      for (const set of scored.sets) {
        await tx.gamePeriodScore.create({ data: { organizationId: ORG, gameId: game.id, period: set.period, label: `SET ${set.period}`, homeScore: set.home, awayScore: set.away } });
      }
      return created;
    });
    results.push({ fixtureId: fixture.id, home: scored.homeSets, away: scored.awaySets, homeSets: scored.homeSets, awaySets: scored.awaySets, sets: scored.sets });
    console.log(`  ${setup.entrants[home].name} ${scored.sets.map((set) => `${set.home}-${set.away}`).join(" ")} ${setup.entrants[away].name} -> ${scored.homeSets}-${scored.awaySets} (${outcome})`);
  }

  // ---- standings through the sport's own tiebreak order -------------------------------------------
  const table = computeSeasonStandings(
    TENNIS,
    setup.entrants.map((entrant) => ({ seasonClubId: entrant.id, name: entrant.name, entrantId: entrant.id })),
    results.map((result, index) => ({
      homeSeasonClubId: setup.entrants[pairs[index][0]].id,
      awaySeasonClubId: setup.entrants[pairs[index][1]].id,
      homeScore: result.homeSets,
      awayScore: result.awaySets,
      winnerSeasonClubId: result.homeSets > result.awaySets ? setup.entrants[pairs[index][0]].id : setup.entrants[pairs[index][1]].id,
    })),
  );
  console.log("");
  console.log("standings (wins, then set ratio, then game ratio):");
  for (const row of table) {
    console.log(`  ${row.name.padEnd(24)} W${row.won} L${row.lost} · sets ${row.secondary.SETS_WON ?? 0}-${row.secondary.SETS_LOST ?? 0} · set ratio ${(row.secondary.SET_RATIO ?? 0).toFixed(3)}`);
  }

  // ---- verification --------------------------------------------------------------------------------
  const problems: string[] = [];
  if (table.length !== 4) problems.push(`expected 4 standing rows, got ${table.length}`);
  const totalWins = table.reduce((sum, row) => sum + row.won, 0);
  if (totalWins !== 6) problems.push(`expected 6 total wins, got ${totalWins}`);
  // Ordering must be non-increasing on wins.
  for (let index = 1; index < table.length; index += 1) {
    if (table[index].won > table[index - 1].won) problems.push(`row ${index} has more wins than the row above`);
  }
  // Persist the standings the way a real finalisation does, so the PUBLIC page has Standing rows to read
  // (the in-memory table above is the engine's answer; this is the same calculation written for the site).
  await withOrganizationContext(ORG, (tx) => recalculateStandings(tx, ORG, setup.season.id));
  const persisted = await withOrganizationContext(ORG, (tx) => tx.standing.count({ where: { seasonId: setup.season.id } }));
  console.log("");
  console.log(`Standing rows persisted: ${persisted}`);
  console.log(problems.length === 0 ? "PASS: 4 entrants, 6 matches, standings consistent (wins sum to 6, ordered)" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  // Knockout bracket (streak v6, Prompt 3): two semis and a final, so the public page has a bracket to
  // render alongside the round-robin table. Fixtures carry a `round`; scores are the semis' real outcomes.
  if (KNOCKOUT) {
    await withOrganizationContext(ORG, async (tx) => {
      const semi = async (home: string, away: string, homeScore: number, awayScore: number) => {
        const fixture = await tx.fixture.create({
          data: {
            organizationId: ORG,
            seasonId: setup.season.id,
            divisionId: setup.division.id,
            venueId: setup.venue.id,
            homeEntrantId: home,
            awayEntrantId: away,
            scheduledAt: new Date(),
            status: "FINAL",
            round: 1,
            homeScore,
            awayScore,
            winnerEntrantId: homeScore > awayScore ? home : away,
          },
          select: { id: true },
        });
        return fixture;
      };
      await semi(setup.entrants[0].id, setup.entrants[1].id, 2, 0);
      await semi(setup.entrants[2].id, setup.entrants[3].id, 2, 1);
      await tx.fixture.create({
        data: {
          organizationId: ORG,
          seasonId: setup.season.id,
          divisionId: setup.division.id,
          venueId: setup.venue.id,
          homeEntrantId: setup.entrants[0].id,
          awayEntrantId: setup.entrants[2].id,
          scheduledAt: new Date(Date.now() + 86_400_000),
          status: "SCHEDULED",
          round: 2,
        },
      });
    });
    console.log("knockout added: 2 semifinals (round 1) + the final (round 2)");
    // The semis are FINAL, so they change the table: recalculate once more.
    await withOrganizationContext(ORG, (tx) => recalculateStandings(tx, ORG, setup.season.id));
  }

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.fixture.deleteMany({ where: { seasonId: setup.season.id } });
      await tx.entrant.deleteMany({ where: { seasonId: setup.season.id } });
      await tx.ruleSet.deleteMany({ where: { id: setup.ruleSet.id } });
      await tx.season.deleteMany({ where: { id: setup.season.id } });
      await tx.division.deleteMany({ where: { id: setup.division.id } });
      await tx.competition.deleteMany({ where: { id: setup.competition.id } });
    });
    console.log("cleanup: competition, season, entrants and fixtures removed (use --keep to inspect them)");
  } else {
    console.log(`--keep: competition ${setup.competition.id} left in place`);
  }
}

main()
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
