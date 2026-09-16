// Multi-sport Stage 5 (S5.3): read-only standings parity check.
//
// Recomputes standings with the generic season engine (computeSeasonStandings, which derives the
// set-based secondary for sports decided over periods/sets) from final fixtures and compares the
// core record fields against the stored Standing rows, keyed by seasonClubId. Verifies Gate G5's
// basketball-parity requirement and validates the volleyball path. Exits non-zero on any mismatch.
// Read-only; runs per organization through withOrganizationContext.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { computeSeasonStandings } from "../src/lib/sports/standings";

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
            select: { id: true, club: { select: { name: true } }, entrant: { select: { id: true } } },
          }),
          tx.fixture.findMany({
            where: { seasonId: season.id, status: "FINAL" },
            select: {
              homeSeasonClubId: true,
              awaySeasonClubId: true,
              homeScore: true,
              awayScore: true,
            },
          }),
          tx.standing.findMany({
            where: { seasonId: season.id },
            select: {
              seasonClubId: true,
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

        if (seasonClubs.length === 0) continue;

        const computed = new Map(
          computeSeasonStandings(
            definition,
            seasonClubs.map((seasonClub) => ({
              seasonClubId: seasonClub.id,
              name: seasonClub.club.name,
              entrantId: seasonClub.entrant?.id ?? null,
            })),
            fixtures.map((fixture) => ({
              ...fixture,
              homeSeasonClubId: fixture.homeSeasonClubId!,
              awaySeasonClubId: fixture.awaySeasonClubId!,
            })),
          ).map((row) => [row.seasonClubId, row]),
        );

        for (const standing of stored) {
          const expected = computed.get(standing.seasonClubId);
          if (!expected) continue;
          orgChecked += 1;
          for (const field of CORE_FIELDS) {
            if (standing[field] !== expected[field]) {
              orgMismatches += 1;
              console.error(
                `  MISMATCH season=${season.id} seasonClub=${standing.seasonClubId} field=${field} stored=${standing[field]} computed=${expected[field]}`,
              );
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
