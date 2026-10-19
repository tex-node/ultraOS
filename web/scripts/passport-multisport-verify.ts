import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { metricSubjectKey } from "../src/lib/sports/metric-values";

// Streak v8, Prompt 3 verification: one athlete with a BASKETBALL game and a VOLLEYBALL game, seen through the
// passport.
//
//   npx tsx scripts/passport-multisport-verify.ts --organization <id> [--player <id>] [--base-url ...] [--token cookie]
//
// The basketball half is a real PlayerStat row that already exists (the LBCL data). The volleyball half is
// written here: a volleyball season, a fixture with a game, and GameMetricValue rows for the SAME player, so the
// passport has to render two sports. Then the page is fetched over HTTP (when a token is given) and asserted to
// show both sports, the volleyball metric labels, and the sport group headers.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const PLAYER_ARG = arg("player");
const BASE_URL = arg("base-url") ?? "http://127.0.0.1:4120";
const TOKEN = arg("token");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION) {
  console.error("usage: passport-multisport-verify.ts --organization <id> [--player <id>] [--base-url url] [--token cookie]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;
const TAG = `PASSPORT MULTISPORT ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

async function main() {
  // 1. an athlete who already has basketball stats (so the passport's basketball half is real data).
  const player = await withOrganizationContext(ORG, async (tx) => {
    const select = { id: true, athlete: { select: { firstName: true, lastName: true } } } as const;
    if (PLAYER_ARG) return tx.player.findFirstOrThrow({ where: { id: PLAYER_ARG, organizationId: ORG }, select });
    // Pick the athlete with the most recorded basketball stats, so the basketball half of the passport is real
    // data rather than an empty table.
    const busiest = await tx.playerStat.groupBy({ by: ["playerId"], where: { organizationId: ORG }, _count: { playerId: true }, orderBy: { _count: { playerId: "desc" } }, take: 1 });
    const playerId = busiest[0]?.playerId;
    if (!playerId) throw new Error("no PlayerStat rows in this organization");
    return tx.player.findFirstOrThrow({ where: { id: playerId, organizationId: ORG }, select });
  });
  const basketballGames = await withOrganizationContext(ORG, (tx) => tx.playerStat.count({ where: { playerId: player.id } }));
  console.log(`player ${player.id} (${player.athlete.firstName} ${player.athlete.lastName}) · ${basketballGames} basketball stat row(s)`);
  if (basketballGames === 0) throw new Error("that player has no basketball stats, so the multi-sport case cannot be shown");

  // 2. a volleyball game, with metric rows for the SAME player.
  const definition = getSportDefinition("volleyball");
  if (!definition) throw new Error("no volleyball definition");
  const sport = await prisma.sport.findFirstOrThrow({ where: { slug: "volleyball" }, select: { id: true } });
  const metricDefinitions = await prisma.sportMetricDefinition.findMany({ where: { sportId: sport.id, subject: "PLAYER" }, select: { id: true, key: true, label: true } });
  const byKey = new Map(metricDefinitions.map((metric) => [metric.key, metric]));

  const setup = await withOrganizationContext(ORG, async (tx) => {
    const competition = await tx.competition.create({ data: { organizationId: ORG, sportId: sport.id, name: TAG, slug: `passport-volley-${Date.now()}` }, select: { id: true } });
    const division = await tx.division.create({ data: { organizationId: ORG, competitionId: competition.id, name: "Open", slug: "open" }, select: { id: true } });
    const season = await tx.season.create({ data: { organizationId: ORG, competitionId: competition.id, name: `${TAG} season`, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }, select: { id: true } });
    const venue = await tx.venue.findFirstOrThrow({ where: { organizationId: ORG }, select: { id: true } });
    const sides = [];
    for (const name of ["Passport Volley A", "Passport Volley B"]) {
      const club = await tx.club.create({ data: { organizationId: ORG, sportId: sport.id, name: `${name} ${Date.now()}`, shortName: name.slice(0, 5).toUpperCase() }, select: { id: true } });
      const seasonClub = await tx.seasonClub.create({ data: { organizationId: ORG, seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
      sides.push(seasonClub.id);
    }
    const fixture = await tx.fixture.create({
      data: {
        organizationId: ORG,
        seasonId: season.id,
        divisionId: division.id,
        venueId: venue.id,
        homeSeasonClubId: sides[0],
        awaySeasonClubId: sides[1],
        scheduledAt: new Date(),
        status: "FINAL",
        homeScore: 3,
        awayScore: 1,
        winnerSeasonClubId: sides[0],
      },
      select: { id: true },
    });
    const game = await tx.game.create({ data: { organizationId: ORG, fixtureId: fixture.id, status: "FINAL", currentPeriod: 4, clockSecondsRemaining: 0, endedAt: new Date() }, select: { id: true } });
    const values: Record<string, number> = { kills: 14, aces: 3, blocks: 2, digs: 9, errors: 5, serves: 18 };
    let written = 0;
    for (const [key, value] of Object.entries(values)) {
      const metric = byKey.get(key);
      if (!metric) throw new Error(`no volleyball metric definition for "${key}" — run scripts/sport-metric-definitions-sync.ts --apply`);
      await tx.gameMetricValue.create({
        data: {
          organizationId: ORG,
          gameId: game.id,
          metricDefinitionId: metric.id,
          subjectType: "PLAYER",
          subjectKey: metricSubjectKey("PLAYER", player.id),
          playerId: player.id,
          period: 0,
          value,
          statSource: "CSV_IMPORT",
        },
      });
      written += 1;
    }
    return { competitionId: competition.id, divisionId: division.id, seasonId: season.id, fixtureId: fixture.id, gameId: game.id, written, values };
  });
  console.log(`volleyball game ${setup.gameId} · ${setup.written} metric row(s): ${Object.entries(setup.values).map(([key, value]) => `${key}=${value}`).join(" ")}`);

  // 3. the passport page itself.
  let rendered = "";
  let status = 0;
  if (TOKEN) {
    const response = await fetch(`${BASE_URL}/players/${player.id}/passport`, { headers: { cookie: `authjs.session-token=${TOKEN}` }, redirect: "manual" });
    status = response.status;
    rendered = await response.text();
    console.log(`GET /players/${player.id}/passport -> ${status} (${rendered.length} bytes)`);
  } else {
    console.log("no --token: skipping the page render");
  }

  const problems: string[] = [];
  if (setup.written === 0) problems.push("no metric rows written");
  if (TOKEN) {
    if (status !== 200) problems.push(`passport returned ${status}`);
    if (!/By sport/i.test(rendered)) problems.push("the passport has no 'By sport' section");
    if (!/Volleyball/i.test(rendered)) problems.push("the volleyball sport name is missing");
    if (!/Kills/i.test(rendered)) problems.push("the Kills metric label is missing");
    if (!/Aces/i.test(rendered)) problems.push("the Aces metric label is missing");
    if (!/Basketball/i.test(rendered)) problems.push("the basketball sport grouping is missing");
    // The volleyball game must appear on the timeline as its own group, not as a zeroed basketball row.
    const volleyballGroups = rendered.match(/uppercase tracking-wider text-brand-400[^>]*>Volleyball/g)?.length ?? 0;
    if (volleyballGroups === 0) problems.push("the game log has no Volleyball group header");
  }

  console.log("");
  console.log(problems.length === 0 ? "PASS: the passport renders both sports with definition-driven stats" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;

  if (!KEEP) {
    await withOrganizationContext(ORG, async (tx) => {
      await tx.gameMetricValue.deleteMany({ where: { gameId: setup.gameId } });
      await tx.fixture.deleteMany({ where: { id: setup.fixtureId } });
      await tx.season.deleteMany({ where: { id: setup.seasonId } });
      await tx.division.deleteMany({ where: { id: setup.divisionId } });
      await tx.competition.deleteMany({ where: { id: setup.competitionId } });
      await tx.club.deleteMany({ where: { organizationId: ORG, name: { startsWith: "Passport Volley" } } });
    });
    console.log("cleanup: volleyball season, game, metric rows and clubs removed (use --keep to inspect)");
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
