import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { parseVolleyballCsv } from "../src/lib/scoresheet/volleyball-extract";
import { approveMetricScoresheet, createMetricScoresheetImport, ingestMetricScoresheet } from "../src/server/scoresheet/metric-imports";
import { metricChecksums, metricColumns, type MetricScoresheet } from "../src/lib/scoresheet/metric-scoresheet";
import { getSportDefinition } from "../src/lib/sports/registry";


// Streak v7, Prompt 2 verification: a volleyball CSV all the way through the review queue.
//
//   npx tsx scripts/volleyball-review-verify.ts --organization <orgId> --base-url http://127.0.0.1:4120 \
//     --token <session-cookie-value> [--keep]
//
// Steps: create the import from the CSV (the same parser and the same creation function the upload action
// calls) -> RENDER the review page over HTTP with a real session cookie and assert it shows the volleyball
// columns and NOT the basketball ones -> approve -> ingest into a fixture -> assert the GameMetricValue rows.
//
// The page render is the part a service-level test cannot prove: if the UI were still hardcoded to
// PTS/REB/AST it would crash or show the wrong columns, and only a real request shows that.

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
const TOKEN = arg("token");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION) {
  console.error("usage: volleyball-review-verify.ts --organization <id> [--base-url url] [--token cookie] [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const TAG = `VOLLEYBALL REVIEW ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

const SHEET = `## Surge
#,Player,K,E,SA,BLK,DIG,AST,PTS
4,Ada Nwosu,12,3,2,1,7,0,15
7,Bode Ade,8,5,0,2,4,1,10
## Vortex
No.,Name,Kill,Attack Error,Aces,Blocks,Digs,Assists,Points
2,Chi Obi,9,4,1,0,6,0,10
5,Dayo Eze,6,6,0,3,2,0,9
`;

function cookieHeader(token: string): string {
  return `authjs.session-token=${token}`;
}

async function main() {
  const parsed = parseVolleyballCsv(SHEET);
  const sheet: MetricScoresheet = {
    sportSlug: "volleyball",
    warnings: parsed.warnings,
    teams: parsed.teams.map((team) => ({
      clubName: team.clubName,
      players: team.players.map((player) => ({ name: player.name, jersey: player.jersey, metrics: player.metrics, warnings: player.warnings })),
    })),
  };
  const definition = getSportDefinition("volleyball");
  if (!definition) throw new Error("no volleyball definition");
  console.log(`columns from the definition: ${metricColumns(definition).map((column) => column.label).join(", ")}`);
  console.log(`checksum before approval: ${metricChecksums(sheet, definition).ok ? "OK" : "FAILING"}`);

  // 1. a real season + fixture + game with the sheet's players, so the ingest has somewhere to land.
  const setup = await withOrganizationContext(ORG, async (tx) => {
    const sport = await tx.sport.findFirstOrThrow({ where: { slug: "volleyball" }, select: { id: true } });
    const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `volley-review-${Date.now()}` }, select: { id: true } });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "Open", slug: "open" }, select: { id: true } });
    const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const sides = [];
    for (const team of sheet.teams) {
      const club = await tx.club.create({ data: { organizationId: ORG, sportId: sport.id, name: `${team.clubName}`, shortName: team.clubName.slice(0, 5).toUpperCase() }, select: { id: true } });
      const seasonClub = await tx.seasonClub.create({ data: { organizationId: ORG, seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
      for (const player of team.players) {
        const [firstName, ...rest] = player.name.split(" ");
        const athlete = await tx.athlete.create({ data: { organizationId: ORG, firstName, lastName: rest.join(" ") || "(unknown)", gender: "MALE", dateOfBirth: new Date("2000-01-01"), dominantHand: "RIGHT" }, select: { id: true } });
        await tx.player.create({ data: { organizationId: ORG, seasonId: season.id, seasonClubId: seasonClub.id, athleteId: athlete.id, position: "OUTSIDE", heightCm: 190, weightKg: 80 } });
      }
      sides.push({ seasonClubId: seasonClub.id, name: team.clubName });
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
    const game = await tx.game.create({ data: { organizationId: ORG, fixtureId: fixture.id, status: "FINAL", currentPeriod: 4, clockSecondsRemaining: 0, endedAt: new Date() }, select: { id: true } });
    return { competitionId: competition.id, divisionId: division.id, seasonId: season.id, fixtureId: fixture.id, gameId: game.id };
  });
  console.log(`fixture ${setup.fixtureId} · game ${setup.gameId}`);

  // 2. the import, created exactly as the upload action creates it.
  const created = await withOrganizationContext(ORG, (tx) =>
    createMetricScoresheetImport(tx, { organizationId: ORG, userId: arg("user") ?? (process.env.ACTOR_ID as string), sourceLabel: `${TAG} upload`, sheet, format: "CSV", sourceInfo: { sourceFile: "volleyball-sample.csv" } }),
  );
  console.log(`import ${created.id} created (REVIEW_REQUIRED)`);

  // 3. render the review page with a real session.
  let rendered = "";
  let status = 0;
  if (TOKEN) {
    const response = await fetch(`${BASE_URL}/scoresheets/${created.id}/review`, { headers: { cookie: cookieHeader(TOKEN) }, redirect: "manual" });
    status = response.status;
    rendered = await response.text();
    console.log(`GET /scoresheets/${created.id}/review -> ${status} (${rendered.length} bytes)`);
  } else {
    console.log("no --token given: skipping the page render (the approve/ingest below still run)");
  }

  // 4. approve + ingest through the same functions the actions call.
  const approved = await withOrganizationContext(ORG, (tx) => approveMetricScoresheet(tx, { organizationId: ORG, importId: created.id, userId: arg("user") ?? (process.env.ACTOR_ID as string), sheet }));
  console.log(`approve: ${approved.ok ? "OK" : `FAILED - ${approved.error}`}`);
  const ingested = await withOrganizationContext(ORG, (tx) => ingestMetricScoresheet(tx, { organizationId: ORG, importId: created.id, fixtureId: setup.fixtureId, userId: arg("user") ?? (process.env.ACTOR_ID as string) }));
  console.log(`ingest: ${ingested.written} row(s) written, ${ingested.skipped.length} skipped`);
  for (const skip of ingested.skipped) console.log(`  skipped ${skip.team}/${skip.player}: ${skip.reason}`);

  const rows = await withOrganizationContext(ORG, (tx) =>
    tx.gameMetricValue.findMany({ where: { gameId: setup.gameId }, select: { value: true, metricDefinition: { select: { key: true } }, player: { select: { athlete: { select: { firstName: true, lastName: true } } } } } }),
  );
  const kills = rows.filter((row) => row.metricDefinition.key === "kills").reduce((sum, row) => sum + Number(row.value), 0);
  console.log(`read back: ${rows.length} metric row(s), kills total ${kills}`);

  const problems: string[] = [];
  if (!approved.ok) problems.push("approval failed");
  if (ingested.written !== 28) problems.push(`${ingested.written} rows written, expected 28`);
  if (ingested.skipped.length !== 0) problems.push(`${ingested.skipped.length} player(s) skipped`);
  if (kills !== 35) problems.push(`kills total ${kills}, expected 35`);
  if (TOKEN) {
    if (status !== 200) problems.push(`review page returned ${status}`);
    if (!/Kills/i.test(rendered)) problems.push("the review page does not show a Kills column");
    if (!/Aces/i.test(rendered)) problems.push("the review page does not show an Aces column");
    // The basketball columns must NOT be rendered for a volleyball sheet.
    if (/>\s*REB\s*</.test(rendered)) problems.push("the review page still renders a REB column (basketball template leaked)");
    if (!/All checks pass|check\(s\) failing/.test(rendered)) problems.push("no checksum panel on the page");
  }

  console.log("");
  console.log(problems.length === 0 ? "PASS: volleyball sheet reviewed, approved and ingested with definition-driven columns" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.gameMetricValue.deleteMany({ where: { gameId: setup.gameId } });
      await tx.scoresheetImport.deleteMany({ where: { id: created.id } });
      await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
      await tx.player.deleteMany({ where: { seasonId: setup.seasonId } });
      await tx.season.deleteMany({ where: { id: setup.seasonId } });
      await tx.division.deleteMany({ where: { id: setup.divisionId } });
      await tx.competition.deleteMany({ where: { id: setup.competitionId } });
      await tx.club.deleteMany({ where: { organizationId: ORG, name: { in: sheet.teams.map((team) => team.clubName) }, seasonClubs: { none: {} } } });
    });
    console.log("cleanup: import, metric rows, fixture, players and competition removed (use --keep to inspect)");
  } else {
    console.log(`--keep: import ${created.id} and competition ${setup.competitionId} left in place`);
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
