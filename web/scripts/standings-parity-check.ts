// Multi-sport Stage 5 (S5.3): read-only standings parity check.
//
// Recomputes standings with the generic engine from final fixtures and compares the core record
// fields (played/won/drawn/lost/pointsFor/pointsAgainst/pointDifference/leaguePoints) against the
// stored Standing rows. Verifies Gate G5's basketball-parity requirement. Exits non-zero on any
// mismatch. Read-only; runs per organization through withOrganizationContext.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { computeStandings } from "../src/lib/sports/standings";

const CORE_FIELDS = [
  "played",
  "won",
  "drawn",
  "lost",
  "pointsFor",
  "pointsAgainst",
  "pointDifference",
  "leaguePoints",
] as const;

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  let mismatches = 0;
  let checked = 0;

  for (const organization of organizations) {
    const result = await withOrganizationContext(organization.id, async (tx) => {
      const seasons = await tx.season.findMany({
        where: { organizationId: organization.id },
        select: { id: true, competition: { select: { sport: { select: { slug: true } } } } },
      });

      let orgChecked = 0;
      let orgMismatches = 0;

      for (const season of seasons) {
        const definition = getSportDefinition(season.competition.sport.slug);
        if (!definition) continue;

        const [seasonClubs, fixtures, stored] = await Promise.all([
          tx.seasonClub.findMany({
            where: { seasonId: season.id },
            select: { id: true, clubId: true, club: { select: { name: true } }, entrant: { select: { id: true } } },
          }),
          tx.fixture.findMany({
            where: { seasonId: season.id, status: "FINAL" },
            select: {
              homeSeasonClubId: true,
              awaySeasonClubId: true,
              homeEntrantId: true,
              awayEntrantId: true,
              homeScore: true,
              awayScore: true,
            },
          }),
          tx.standing.findMany({
            where: { seasonId: season.id },
            select: {
              seasonClubId: true,
              entrantId: true,
              played: true,
              won: true,
              drawn: true,
              lost: true,
              pointsFor: true,
              pointsAgainst: true,
              pointDifference: true,
              leaguePoints: true,
            },
          }),
        ]);

        const entrantBySeasonClub = new Map(seasonClubs.map((seasonClub) => [seasonClub.id, seasonClub.entrant?.id ?? null]));
        const entrants = seasonClubs
          .filter((seasonClub) => seasonClub.entrant?.id)
          .map((seasonClub) => ({ entrantId: seasonClub.entrant!.id, name: seasonClub.club.name }));
        if (entrants.length === 0) continue;

        const results = fixtures
          .map((fixture) => {
            const home = fixture.homeEntrantId ?? entrantBySeasonClub.get(fixture.homeSeasonClubId) ?? null;
            const away = fixture.awayEntrantId ?? entrantBySeasonClub.get(fixture.awaySeasonClubId) ?? null;
            if (!home || !away) return null;
            return {
              homeEntrantId: home,
              awayEntrantId: away,
              homeScore: fixture.homeScore,
              awayScore: fixture.awayScore,
            };
          })
          .filter((value): value is NonNullable<typeof value> => value !== null);

        const computed = new Map(computeStandings(definition, entrants, results).map((row) => [row.entrantId, row]));

        for (const standing of stored) {
          const entrantId = standing.entrantId ?? entrantBySeasonClub.get(standing.seasonClubId) ?? null;
          if (!entrantId) continue;
          const expected = computed.get(entrantId);
          if (!expected) continue;
          orgChecked += 1;
          for (const field of CORE_FIELDS) {
            if (standing[field] !== expected[field]) {
              orgMismatches += 1;
              console.error(`  MISMATCH season=${season.id} entrant=${entrantId} field=${field} stored=${standing[field]} computed=${expected[field]}`);
            }
          }
        }
      }

      return { orgChecked, orgMismatches };
    });

    checked += result.orgChecked;
    mismatches += result.orgMismatches;
    console.log(`[${result.orgMismatches === 0 ? "OK" : "FAIL"}] ${organization.name}: checked=${result.orgChecked} mismatches=${result.orgMismatches}`);
  }

  console.log(mismatches === 0 ? `PARITY OK (${checked} standings compared)` : `PARITY FAILED (${mismatches} mismatches of ${checked})`);
  if (mismatches > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
