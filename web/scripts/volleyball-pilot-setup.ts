// Multi-sport Stage 8/9 pilot: create a runnable volleyball competition (Gate G4).
//
// Builds a self-contained volleyball pilot: sport + competition + season + division, N clubs with
// SeasonClub + TEAM Entrant, and a single round-robin fixture schedule. With --with-results it also
// finalizes each fixture with a set score (3-0 / 3-1 / 3-2 mix) and recalculates standings through
// the sport-aware engine, proving volleyball match points and set ratio end-to-end.
//
// Idempotent: finds-or-creates by natural keys; skips fixture generation if the season already has
// fixtures. Dry-run by default. Runs inside tenant context against DATABASE_URL.
//
// Usage:
//   tsx scripts/volleyball-pilot-setup.ts
//   tsx scripts/volleyball-pilot-setup.ts --apply --with-results
//   tsx scripts/volleyball-pilot-setup.ts --apply --clubs 6 --name "Volleyball Pilot League"
import { prisma } from "../src/lib/prisma";
import { recalculateStandings } from "../src/lib/standings-recalculate";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "../src/lib/tenant-context";
import { generateRoundRobin } from "../src/lib/sports/fixtures";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const ORG_SLUG = arg("organization-slug") ?? "neon-ultra";
const NAME = arg("name") ?? "Volleyball Pilot Cup";
const SLUG = arg("competition-slug") ?? "volleyball-pilot";
const SEASON_NAME = arg("season") ?? "2026";
const DIVISION_NAME = arg("division") ?? "Open";
const CLUB_COUNT = Math.max(2, Number(arg("clubs") ?? 4));

async function main() {
  const apply = flag("apply");
  const withResults = flag("with-results");
  const organization = await resolveActiveOrganizationBySlug(ORG_SLUG);

  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} org=${ORG_SLUG} competition="${NAME}" clubs=${CLUB_COUNT} withResults=${withResults}`);

  const summary = await withOrganizationContext(organization.id, async (tx) => {
    const sport = apply
      ? await tx.sport.upsert({ where: { slug: "volleyball" }, update: { name: "Volleyball", isActive: true }, create: { name: "Volleyball", slug: "volleyball" } })
      : await tx.sport.findUnique({ where: { slug: "volleyball" }, select: { id: true } });

    let competition = await tx.competition.findFirst({ where: { organizationId: organization.id, slug: SLUG }, select: { id: true } });
    if (!competition && apply && sport) {
      competition = await tx.competition.create({
        data: { organizationId: organization.id, sportId: sport.id, name: NAME, slug: SLUG, description: "Volleyball pilot competition." },
        select: { id: true },
      });
    }

    let season = competition
      ? await tx.season.findFirst({ where: { competitionId: competition.id, name: SEASON_NAME }, select: { id: true } })
      : null;
    if (!season && apply && competition) {
      season = await tx.season.create({
        data: { organizationId: organization.id, competitionId: competition.id, name: SEASON_NAME, startDate: new Date("2026-08-01T00:00:00.000Z"), endDate: new Date("2026-12-31T23:59:59.000Z") },
        select: { id: true },
      });
    }

    let division = competition
      ? await tx.division.findFirst({ where: { competitionId: competition.id, slug: DIVISION_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-") }, select: { id: true } })
      : null;
    if (!division && apply && competition) {
      division = await tx.division.create({
        data: { organizationId: organization.id, competitionId: competition.id, name: DIVISION_NAME, slug: DIVISION_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
        select: { id: true },
      });
    }

    if (!apply || !competition || !season || !division) {
      return { sportId: sport?.id ?? null, competitionId: competition?.id ?? null, seasonId: season?.id ?? null, divisionId: division?.id ?? null, clubs: 0, entrants: 0, fixturesCreated: 0, resultsFinalized: 0 };
    }

    const existingFixtures = await tx.fixture.count({ where: { seasonId: season.id } });

    // Clubs + SeasonClubs + TEAM Entrants
    const seasonClubIds: string[] = [];
    let entrantsCreated = 0;
    for (let index = 1; index <= CLUB_COUNT; index += 1) {
      const clubName = `Pilot VC ${index}`;
      const shortName = `PVC${index}`;
      let club = await tx.club.findFirst({ where: { organizationId: organization.id, shortName }, select: { id: true } });
      if (!club) {
        club = await tx.club.create({
          data: { organizationId: organization.id, sportId: sport!.id, name: clubName, shortName },
          select: { id: true },
        });
      }
      let seasonClub = await tx.seasonClub!.findFirst({ where: { seasonId: season.id, clubId: club.id, divisionId: division.id }, select: { id: true } });
      if (!seasonClub) {
        seasonClub = await tx.seasonClub!.create({
          data: { organizationId: organization.id, seasonId: season.id, clubId: club.id, divisionId: division.id },
          select: { id: true },
        });
      }
      seasonClubIds.push(seasonClub.id);

      const entrant = await tx.entrant.findFirst({ where: { seasonClubId: seasonClub.id }, select: { id: true } });
      if (!entrant) {
        await tx.entrant.create({
          data: {
            organizationId: organization.id,
            competitionId: competition.id,
            seasonId: season.id,
            divisionId: division.id,
            seasonClubId: seasonClub.id,
            type: "TEAM",
            name: clubName,
            shortName,
          },
        });
        entrantsCreated += 1;
      }
    }

    if (existingFixtures > 0) {
      return { sportId: sport?.id ?? null, competitionId: competition.id, seasonId: season.id, divisionId: division.id, clubs: seasonClubIds.length, entrants: entrantsCreated, fixturesCreated: 0, resultsFinalized: 0, note: `season already has ${existingFixtures} fixtures` };
    }

    const venue = await tx.venue.findFirst({ where: { organizationId: organization.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!venue) throw new Error("No venue exists for the organization; create one first.");

    const pairs = generateRoundRobin(seasonClubIds);
    let fixturesCreated = 0;
    let resultsFinalized = 0;
    let day = 0;
    for (const pair of pairs) {
      const scheduledAt = new Date(Date.UTC(2026, 7, 5 + day, 16, 0, 0));
      day += 1;
      const loserSets = resultsFinalized % 3; // 0/1 => sweep, 2 => five-set
      const homeScore = withResults ? 3 : 0;
      const awayScore = withResults ? loserSets : 0;
      await tx.fixture.create({
        data: {
          organizationId: organization.id,
          seasonId: season.id,
          divisionId: division.id,
          homeSeasonClubId: pair.homeEntrantId,
          awaySeasonClubId: pair.awayEntrantId,
          scheduledAt,
          venueId: venue.id,
          status: withResults ? "FINAL" : "SCHEDULED",
          homeScore,
          awayScore,
          ...(withResults ? { winnerSeasonClubId: pair.homeEntrantId } : {}),
        },
      });
      fixturesCreated += 1;
      if (withResults) resultsFinalized += 1;
    }

    if (withResults) {
      await recalculateStandings(tx, organization.id, season.id);
    }

    return { sportId: sport?.id ?? null, competitionId: competition.id, seasonId: season.id, divisionId: division.id, clubs: seasonClubIds.length, entrants: entrantsCreated, fixturesCreated, resultsFinalized };
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
