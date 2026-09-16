// Multi-sport Stage B4 pilot: an individual-sport (tennis) competition with Entrant sides only.
//
// Creates INDIVIDUAL entrants (no Club, no SeasonClub) and round-robin fixtures whose sides are
// entrants, then with --with-results finalizes set scores and recalculates entrant-keyed standings.
// Proves the individual-sport data path end-to-end.
//
// Idempotent: finds-or-creates by natural keys; skips fixtures if the season already has any.
// Dry-run by default.
import { prisma } from "../src/lib/prisma";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { generateRoundRobin } from "../src/lib/sports/fixtures";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "../src/lib/tenant-context";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const ORG_SLUG = arg("organization-slug") ?? "neon-ultra";
const NAME = arg("name") ?? "Tennis Pilot Open";
const SLUG = arg("competition-slug") ?? "tennis-pilot";
const SEASON_NAME = arg("season") ?? "2026";
const DIVISION_NAME = arg("division") ?? "Singles";
const PLAYER_COUNT = Math.max(2, Number(arg("players") ?? 4));

function letter(index: number): string {
  return String.fromCharCode(64 + index);
}

async function main() {
  const apply = flag("apply");
  const withResults = flag("with-results");
  const organization = await resolveActiveOrganizationBySlug(ORG_SLUG);
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} org=${ORG_SLUG} competition="${NAME}" players=${PLAYER_COUNT} withResults=${withResults}`);

  const summary = await withOrganizationContext(organization.id, async (tx) => {
    const sport = apply
      ? await tx.sport.upsert({ where: { slug: "tennis" }, update: { name: "Tennis", isActive: true }, create: { name: "Tennis", slug: "tennis" } })
      : await tx.sport.findUnique({ where: { slug: "tennis" }, select: { id: true } });

    let competition = await tx.competition.findFirst({ where: { organizationId: organization.id, slug: SLUG }, select: { id: true } });
    if (!competition && apply && sport) {
      competition = await tx.competition.create({ data: { organizationId: organization.id, sportId: sport.id, name: NAME, slug: SLUG, description: "Tennis individual pilot." }, select: { id: true } });
    }

    let season = competition ? await tx.season.findFirst({ where: { competitionId: competition.id, name: SEASON_NAME }, select: { id: true } }) : null;
    if (!season && apply && competition) {
      season = await tx.season.create({ data: { organizationId: organization.id, competitionId: competition.id, name: SEASON_NAME, startDate: new Date("2026-09-01T00:00:00.000Z"), endDate: new Date("2026-10-31T23:59:59.000Z") }, select: { id: true } });
    }

    let division = competition ? await tx.division.findFirst({ where: { competitionId: competition.id, slug: DIVISION_NAME.toLowerCase() }, select: { id: true } }) : null;
    if (!division && apply && competition) {
      division = await tx.division.create({ data: { organizationId: organization.id, competitionId: competition.id, name: DIVISION_NAME, slug: DIVISION_NAME.toLowerCase() }, select: { id: true } });
    }

    if (!apply || !competition || !season || !division) {
      return { sportId: sport?.id ?? null, competitionId: competition?.id ?? null, seasonId: season?.id ?? null, entrants: 0, fixturesCreated: 0, resultsFinalized: 0 };
    }

    const entrantIds: string[] = [];
    let entrantsCreated = 0;
    for (let index = 1; index <= PLAYER_COUNT; index += 1) {
      const name = `Tennis Player ${letter(index)}`;
      let entrant = await tx.entrant.findFirst({ where: { seasonId: season.id, name }, select: { id: true } });
      if (!entrant) {
        entrant = await tx.entrant.create({
          data: { organizationId: organization.id, competitionId: competition.id, seasonId: season.id, divisionId: division.id, type: "INDIVIDUAL", name },
          select: { id: true },
        });
        entrantsCreated += 1;
      }
      entrantIds.push(entrant.id);
    }

    const existingFixtures = await tx.fixture.count({ where: { seasonId: season.id } });
    if (existingFixtures > 0) {
      return { sportId: sport?.id ?? null, competitionId: competition.id, seasonId: season.id, entrants: entrantsCreated, fixturesCreated: 0, resultsFinalized: 0, note: `season already has ${existingFixtures} fixtures` };
    }

    const venue = await tx.venue.findFirst({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!venue) throw new Error("No venue exists for the organization; create one first.");

    const pairs = generateRoundRobin(entrantIds);
    let fixturesCreated = 0;
    let resultsFinalized = 0;
    let day = 0;
    for (const pair of pairs) {
      const scheduledAt = new Date(Date.UTC(2026, 8, 1 + day, 10, 0, 0));
      day += 1;
      const loserSets = resultsFinalized % 2; // 0 => 2-0, 1 => 2-1
      await tx.fixture.create({
        data: {
          organizationId: organization.id,
          seasonId: season.id,
          divisionId: division.id,
          homeEntrantId: pair.homeEntrantId,
          awayEntrantId: pair.awayEntrantId,
          scheduledAt,
          venueId: venue.id,
          status: withResults ? "FINAL" : "SCHEDULED",
          homeScore: withResults ? 2 : 0,
          awayScore: withResults ? loserSets : 0,
          winnerEntrantId: withResults ? pair.homeEntrantId : null,
        },
      });
      fixturesCreated += 1;
      if (withResults) resultsFinalized += 1;
    }

    if (withResults) {
      await recalculateStandings(tx, organization.id, season.id);
    }

    return { sportId: sport?.id ?? null, competitionId: competition.id, seasonId: season.id, entrants: entrantsCreated, fixturesCreated, resultsFinalized };
  });

  console.log(JSON.stringify(summary, null, 2));
  console.log(apply ? "applied." : "dry-run: nothing written (pass --apply).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
