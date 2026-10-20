import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createGame } from "../src/server/scoring/createGame";
import { createGameEvent } from "../src/server/scoring/createGameEvent";
import { loadTimedConsoleData, loadSeasonTimedLeaderboard } from "../src/server/timed/timed-console";
import { formatRaceTime } from "../src/lib/sports/timed-standings";
import { randomUUID } from "node:crypto";

// Streak v12, Prompt 1b: the flag-race timing path, end to end.
//
//   npx tsx scripts/flag-race-verify.ts --organization <orgId> --actor <userId> [--keep]
//
// Creates a real flag-race competition with four entrants, records finish times through the SAME canonical write
// path the timing console uses (createGameEvent with typeKey FINISH_TIME and data.seconds), then asserts:
//   - the raw event rows carry a positive fractional time;
//   - the console loader offers the entrants and lists the times it has;
//   - the season leaderboard orders fastest-first with the right gaps and shared ranks;
//   - no fixture score was touched (a race is not 1-0).
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const ACTOR = arg("actor");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION || !ACTOR) {
  console.error("usage: flag-race-verify.ts --organization <id> --actor <userId> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const ACTOR_ID: string = ACTOR;
const TAG = `FLAG RACE ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

async function main() {
  const setup = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "flag-race" }, select: { id: true } });
    const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `flag-race-verify-${Date.now()}` }, select: { id: true } });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "Open", slug: "open" }, select: { id: true } });
    const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, status: "ACTIVE", startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const entrants = [];
    for (const name of ["Ada Sprint", "Bola Dash", "Chidi Bolt", "Dayo Rush"]) {
      const entrant = await tx.entrant.create({ data: { organizationId: ORG, competitionId: competition.id, seasonId: season.id, divisionId: division.id, type: "INDIVIDUAL", name: `${name} ${randomUUID().slice(0, 3)}` }, select: { id: true, name: true } });
      entrants.push(entrant);
    }
    const fixture = await tx.fixture.create({
      data: {
        organizationId: ORG, seasonId: season.id, divisionId: division.id, venueId: venue.id, scheduledAt: new Date(), status: "LIVE",
        homeEntrantId: entrants[0].id, awayEntrantId: entrants[1].id,
      },
      select: { id: true },
    });
    return { competitionId: competition.id, divisionId: division.id, seasonId: season.id, fixtureId: fixture.id, entrants };
  });

  const game = await withOrganizationContext(ORG, (tx) =>
    createGame({ id: `flag_${randomUUID().slice(0, 8)}`, fixtureId: setup.fixtureId, status: "LIVE", currentPeriod: 1, clockSecondsRemaining: 0 }, { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" }),
  );
  console.log(`flag-race fixture ${setup.fixtureId} · game ${game.id} · ${setup.entrants.length} entrants`);

  // Times deliberately out of order, with a tie, so the ordering is proven rather than assumed.
  const times: { entrant: (typeof setup.entrants)[number]; seconds: number }[] = [
    { entrant: setup.entrants[2], seconds: 12.45 },
    { entrant: setup.entrants[0], seconds: 11.98 },
    { entrant: setup.entrants[1], seconds: 12.45 },
    { entrant: setup.entrants[3], seconds: 13.1 },
  ];
  for (const entry of times) {
    await withOrganizationContext(ORG, (tx) =>
      createGameEvent(
        {
          gameId: game.id,
          fixtureId: setup.fixtureId,
          entrantId: entry.entrant.id,
          eventType: "NOTE",
          typeKey: "FINISH_TIME",
          data: { seconds: entry.seconds },
          period: 1,
          clockSeconds: 0,
          description: `Finish time ${entry.seconds.toFixed(2)}s`,
        },
        { tx, actor: { id: ACTOR_ID, organizationId: ORG }, source: "LIVE_UI" },
      ),
    );
    console.log(`  recorded ${entry.entrant.name}: ${entry.seconds.toFixed(2)}s`);
  }

  const consoleData = await loadTimedConsoleData(ORG, setup.fixtureId);
  const leaderboard = await loadSeasonTimedLeaderboard(ORG, setup.seasonId);
  const fixtureAfter = await withOrganizationContext(ORG, (tx) => tx.fixture.findUniqueOrThrow({ where: { id: setup.fixtureId }, select: { homeScore: true, awayScore: true, status: true } }));
  const eventRows = await withOrganizationContext(ORG, (tx) => tx.gameEvent.findMany({ where: { gameId: game.id, typeKey: "FINISH_TIME" }, select: { data: true } }));

  console.log("");
  console.log(`console loader: ${consoleData.competitors.length} competitors, ${consoleData.recent.length} recorded times`);
  console.log("leaderboard:");
  for (const row of leaderboard) {
    console.log(`  #${row.rank} ${row.name} ${formatRaceTime(row.seconds)}${row.gapSeconds > 0 ? ` (+${row.gapSeconds.toFixed(2)})` : ""}`);
  }
  console.log(`fixture score untouched: ${fixtureAfter.homeScore}-${fixtureAfter.awayScore} (status ${fixtureAfter.status})`);

  const problems: string[] = [];
  if (eventRows.length !== 4) problems.push(`${eventRows.length} FINISH_TIME rows, expected 4`);
  if (!eventRows.every((row) => typeof (row.data as { seconds?: number } | null)?.seconds === "number" && ((row.data as { seconds: number }).seconds ?? 0) > 0)) {
    problems.push("an event row has no positive seconds value");
  }
  // The fixture sides ARE two of the season entrants here, so the pool is the four entrants (deduplicated), not\n  // six: my first expectation double-counted them.\n  if (consoleData.competitors.length !== setup.entrants.length) problems.push(`console offers ${consoleData.competitors.length} competitors, expected ${setup.entrants.length}`);\n  for (const entrant of setup.entrants) {\n    if (!consoleData.competitors.some((competitor) => competitor.id === entrant.id)) problems.push(`console does not offer ${entrant.name}`);\n  }
  if (consoleData.recent.length !== 4) problems.push(`console lists ${consoleData.recent.length} times, expected 4`);
  if (leaderboard.length !== 4) problems.push(`leaderboard has ${leaderboard.length} rows, expected 4`);
  if (leaderboard[0]?.seconds !== 11.98) problems.push(`fastest time is ${leaderboard[0]?.seconds}, expected 11.98`);
  if (leaderboard.some((row) => row.key === setup.entrants[3].id)) {
    const last = leaderboard[leaderboard.length - 1];
    if (last.key !== setup.entrants[3].id) problems.push("the slowest entrant is not last");
  }
  const tied = leaderboard.filter((row) => row.seconds === 12.45);
  if (tied.length !== 2) problems.push(`${tied.length} rows on 12.45s, expected 2`);
  if (!tied.every((row) => row.rank === tied[0]?.rank)) problems.push("tied times do not share a rank");
  const afterTie = leaderboard.find((row) => row.key === setup.entrants[3].id);
  if (afterTie && afterTie.rank !== 4) problems.push(`the entrant after the tie is ranked ${afterTie.rank}, expected 4`);
  if (fixtureAfter.homeScore !== 0 || fixtureAfter.awayScore !== 0) problems.push(`the fixture score was written (${fixtureAfter.homeScore}-${fixtureAfter.awayScore}); a race must not look like a scoreline`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: finish times are stored as events and the leaderboard orders them fastest-first, ties included" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
      await tx.entrant.deleteMany({ where: { seasonId: setup.seasonId } });
      await tx.season.deleteMany({ where: { id: setup.seasonId } });
      await tx.division.deleteMany({ where: { id: setup.divisionId } });
      await tx.competition.deleteMany({ where: { id: setup.competitionId } });
    });
    console.log("cleanup: flag-race competition, entrants, fixture and events removed (use --keep to inspect)");
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
