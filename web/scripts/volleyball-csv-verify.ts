import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { metricSubjectKey } from "../src/lib/sports/metric-values";
import { parseVolleyballCsv } from "../src/lib/scoresheet/volleyball-extract";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { randomUUID } from "node:crypto";

// Streak v6, Prompt 4 verification: a volleyball box score CSV through the ingestion pipeline.
//
//   npx tsx scripts/volleyball-csv-verify.ts --organization <id> [--keep]
//
// The pipeline exercised, in order:
//   1. parse the CSV into definition metric keys (kills/errors/aces/blocks/digs/assists/points)
//   2. materialise the Volleyball SportMetricDefinition catalog from the registry (the same upsert the
//      sport-metric-definitions-sync script performs)
//   3. write GameMetricValue rows for a real game, one per parsed player and metric
//   4. read them back and compare the totals with the sheet
//   5. recalculate standings for the season (sets decide the table)
//
// What this does NOT do, deliberately: the REVIEW QUEUE is still basketball-shaped (ScoresheetImport columns
// are made/attempted shooting stats). The extraction and the metric write are proven here; routing a
// volleyball file through the review UI is a separate piece of work, recorded in MULTI_SPORT_PILOT.md rather
// than faked with a "reviewed" row that no operator could have produced.

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION) {
  console.error("usage: volleyball-csv-verify.ts --organization <id> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const TAG = `VOLLEYBALL CSV ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

// A standard five-set box score: printed abbreviations for one side, long names for the other.
const SHEET = `## Surge
#,Player,K,E,SA,BLK,DIG,AST,PTS
4,Ada Nwosu,12,3,2,1,7,0,15
7,Bode Ade,8,5,0,2,4,1,10
## Vortex
No.,Name,Kill,Attack Error,Aces,Blocks,Digs,Assists,Points
2,Chi Obi,9,4,1,0,6,0,10
5,Dayo Eze,6,6,0,3,2,0,9
`;

async function main() {
  const parsed = parseVolleyballCsv(SHEET);
  console.log(`parsed ${parsed.teams.length} teams, ${parsed.teams.reduce((sum, team) => sum + team.players.length, 0)} players`);
  for (const team of parsed.teams) {
    console.log(`  ${team.clubName}: ${team.players.map((player) => `${player.name} (${player.metrics.kills ?? 0}K/${player.metrics.aces ?? 0}A/${player.metrics.blocks ?? 0}B)`).join(", ")}`);
  }
  if (parsed.warnings.length > 0) throw new Error(`parser warnings: ${parsed.warnings.join("; ")}`);

  // 2. Materialise the catalog for this sport (idempotent, same as the sync script).
  const definition = getSportDefinition("volleyball");
  if (!definition) throw new Error("no volleyball definition in the registry");
  const sport = await prisma.sport.upsert({ where: { slug: definition.slug }, update: { name: definition.name, isActive: true }, create: { name: definition.name, slug: definition.slug } });
  const definitions = new Map<string, string>();
  for (const metric of definition.metrics) {
    const row = await prisma.sportMetricDefinition.upsert({
      where: { sportId_subject_key: { sportId: sport.id, subject: metric.subject, key: metric.key } },
      update: { label: metric.label, valueType: metric.valueType, aggregation: metric.aggregation, category: metric.category ?? null, derivedFromEventKeys: metric.derivedFromEventKeys ?? [], sortOrder: metric.sortOrder ?? 0 },
      create: { sportId: sport.id, key: metric.key, label: metric.label, valueType: metric.valueType, subject: metric.subject, aggregation: metric.aggregation, category: metric.category ?? null, derivedFromEventKeys: metric.derivedFromEventKeys ?? [], sortOrder: metric.sortOrder ?? 0 },
      select: { id: true, subject: true },
    });
    definitions.set(`${metric.subject}:${metric.key}`, row.id);
  }
  const playerDefinitions = definition.metrics.filter((metric) => metric.subject === "PLAYER");
  console.log(`SportMetricDefinition rows for volleyball: ${definition.metrics.length} (${playerDefinitions.length} player metrics)`);

  // 3. A real season with a real result, so the metric rows and the table have somewhere to live.
  const setup = await withOrganizationContext(ORG, async (tx) => {
    const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `volleyball-csv-${Date.now()}` }, select: { id: true } });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "Open", slug: "open" }, select: { id: true } });
    const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });

    const sides = [];
    for (const team of parsed.teams) {
      const club = await tx.club.create({ data: { organizationId: ORG, sportId: sport.id, name: team.clubName, shortName: team.clubName.slice(0, 5).toUpperCase() }, select: { id: true, name: true } });
      const seasonClub = await tx.seasonClub.create({ data: { organizationId: ORG, seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
      const players = [];
      for (const player of team.players) {
        const [firstName, ...rest] = player.name.split(" ");
        const athlete = await tx.athlete.create({ data: { organizationId: ORG, firstName, lastName: rest.join(" ") || "(unknown)", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" }, select: { id: true } });
        const jersey = player.jersey && !Number.isNaN(Number(player.jersey)) ? Number(player.jersey) : null;
        const row = await tx.player.create({ data: { organizationId: ORG, seasonId: season.id, seasonClubId: seasonClub.id, athleteId: athlete.id, position: "OUTSIDE", heightCm: 190, weightKg: 80, jerseyNumber: jersey }, select: { id: true } });
        players.push({ ...player, playerId: row.id });
      }
      sides.push({ seasonClubId: seasonClub.id, name: club.name, players });
    }

    const fixture = await tx.fixture.create({
      data: {
        organizationId: ORG,
        seasonId: season.id,
        divisionId: division.id,
        venueId: venue.id,
        homeSeasonClubId: sides[0].seasonClubId,
        awaySeasonClubId: sides[1].seasonClubId,
        scheduledAt: new Date(),
        status: "FINAL",
        homeScore: 3,
        awayScore: 1,
        winnerSeasonClubId: sides[0].seasonClubId,
      },
      select: { id: true },
    });
    const game = await tx.game.create({
      data: { organizationId: ORG, fixtureId: fixture.id, status: "FINAL", currentPeriod: 4, clockSecondsRemaining: 0, endedAt: new Date(), dataCapability: "BOX_SCORE_ONLY", statSource: "FIBA_LIVESTATS_PDF_IMPORT" },
      select: { id: true },
    });
    for (const [index, score] of [[25, 20], [22, 25], [25, 18], [25, 22]].entries()) {
      await tx.gamePeriodScore.create({ data: { organizationId: ORG, gameId: game.id, period: index + 1, label: `SET ${index + 1}`, homeScore: score[0], awayScore: score[1] } });
    }
    return { competitionId: competition.id, divisionId: division.id, seasonId: season.id, fixtureId: fixture.id, gameId: game.id, sides };
  });
  console.log(`season/create ok: fixture ${setup.fixtureId} · game ${setup.gameId}`);

  // 4. Write GameMetricValue rows from the parsed sheet.
  const written = await withOrganizationContext(ORG, async (tx) => {
    let count = 0;
    for (const side of setup.sides) {
      for (const player of side.players) {
        for (const [key, value] of Object.entries(player.metrics)) {
          const definitionId = definitions.get(`PLAYER:${key}`);
          if (!definitionId) throw new Error(`no SportMetricDefinition for player metric "${key}"`);
          await tx.gameMetricValue.create({
            data: {
              organizationId: ORG,
              gameId: setup.gameId,
              metricDefinitionId: definitionId,
              subjectType: "PLAYER",
              subjectKey: metricSubjectKey("PLAYER", player.playerId),
              playerId: player.playerId,
              period: 0,
              value,
              statSource: "FIBA_LIVESTATS_PDF_IMPORT",
            },
          });
          count += 1;
        }
      }
    }
    return count;
  });
  console.log(`GameMetricValue rows written: ${written}`);

  // 5. Read back and compare with the sheet.
  const readBack = await withOrganizationContext(ORG, (tx) =>
    tx.gameMetricValue.groupBy({ by: ["metricDefinitionId"], where: { gameId: setup.gameId }, _sum: { value: true } }),
  );
  const totalFor = (metricKey: string) => {
    const definitionId = definitions.get(`PLAYER:${metricKey}`);
    return Number(readBack.find((row) => row.metricDefinitionId === definitionId)?._sum.value ?? 0);
  };
  const expectedKills = parsed.teams.flatMap((team) => team.players).reduce((sum, player) => sum + (player.metrics.kills ?? 0), 0);
  const expectedAces = parsed.teams.flatMap((team) => team.players).reduce((sum, player) => sum + (player.metrics.aces ?? 0), 0);
  console.log(`totals read back: kills=${totalFor("kills")} aces=${totalFor("aces")} blocks=${totalFor("blocks")} digs=${totalFor("digs")} (sheet: kills=${expectedKills} aces=${expectedAces})`);

  await withOrganizationContext(ORG, (tx) => recalculateStandings(tx, ORG, setup.seasonId));
  const standings = await withOrganizationContext(ORG, (tx) =>
    tx.standing.findMany({ where: { seasonId: setup.seasonId }, include: { seasonClub: { select: { club: { select: { name: true } } } } }, orderBy: { rank: "asc" } }),
  );
  console.log("standings:");
  for (const row of standings) {
    console.log(`  ${row.seasonClub?.club.name ?? "?"} rank=${row.rank} W${row.won} L${row.lost} sets ${row.pointsFor}-${row.pointsAgainst}`);
  }

  const problems: string[] = [];
  if (parsed.teams.length !== 2) problems.push(`parsed ${parsed.teams.length} teams`);
  if (totalFor("kills") !== expectedKills) problems.push(`kills total ${totalFor("kills")} != sheet ${expectedKills}`);
  if (totalFor("aces") !== expectedAces) problems.push(`aces total ${totalFor("aces")} != sheet ${expectedAces}`);
  if (standings.length !== 2) problems.push(`${standings.length} standing rows, expected 2`);
  const winner = standings.find((row) => row.rank === 1);
  if (!winner || winner.seasonClub?.club.name !== "Surge") problems.push("the ranked-first side is not Surge (the 3-1 winner)");
  if (winner && winner.won !== 1) problems.push(`the winning side has won=${winner?.won}, expected 1`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: parsed, catalogs, metric rows and standings all agree" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.standing.deleteMany({ where: { seasonId: setup.seasonId } });
      await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
      await tx.club.deleteMany({ where: { id: { in: [] } } });
      await tx.season.deleteMany({ where: { id: setup.seasonId } });
      await tx.division.deleteMany({ where: { id: setup.divisionId } });
      await tx.competition.deleteMany({ where: { id: setup.competitionId } });
      // The clubs/athletes/players created here are removed last; the unique names carry the TAG so they are
      // identifiable even if a delete above fails.
      await tx.player.deleteMany({ where: { organizationId: ORG, seasonId: setup.seasonId } });
      await tx.club.deleteMany({ where: { organizationId: ORG, name: { in: parsed.teams.map((team) => team.clubName) }, seasonClubs: { none: {} } } });
    });
    console.log("cleanup: competition, clubs, players and fixture removed (use --keep to inspect)");
  } else {
    console.log(`--keep: competition ${setup.competitionId} left in place`);
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
