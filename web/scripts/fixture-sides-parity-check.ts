// Multi-sport fixture-side parity check (Stage B1).
//
// Verifies the fixture-side invariants the staged Entrant model relies on:
//   * every side that is represented by a SeasonClub has one (and, after Stage B2, that a side with
//     neither a SeasonClub nor an Entrant never exists);
//   * where an entrant side is populated, its Entrant.seasonClubId matches the fixture's SeasonClub
//     side for that end (so the SeasonClub and Entrant views describe the same party);
//   * reports how many fixtures have entrant sides at all (coverage after the Stage 2 backfill).
//
// Read-only. Exits non-zero on any mismatch. Runs per organization through withOrganizationContext.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  let problems = 0;

  for (const organization of organizations) {
    const result = await withOrganizationContext(organization.id, async (tx) => {
      const fixtures = await tx.fixture.findMany({
        where: { organizationId: organization.id },
        select: {
          id: true,
          homeSeasonClubId: true,
          awaySeasonClubId: true,
          homeEntrantId: true,
          awayEntrantId: true,
          homeEntrant: { select: { seasonClubId: true } },
          awayEntrant: { select: { seasonClubId: true } },
        },
      });

      let missingSeasonClub = 0;
      let missingBothSides = 0;
      let danglingEntrant = 0;
      let entrantMismatch = 0;
      let withEntrantSides = 0;

      for (const fixture of fixtures) {
        const sides = [
          { sc: fixture.homeSeasonClubId!, entrantId: fixture.homeEntrantId, entrantSeasonClubId: fixture.homeEntrant?.seasonClubId ?? null },
          { sc: fixture.awaySeasonClubId!, entrantId: fixture.awayEntrantId, entrantSeasonClubId: fixture.awayEntrant?.seasonClubId ?? null },
        ];
        let hasEntrantBoth = true;
        for (const side of sides) {
          if (!side.sc) missingSeasonClub += 1;
          if (!side.sc && !side.entrantId) missingBothSides += 1;
          if (side.entrantId && side.entrantSeasonClubId === null) danglingEntrant += 1;
          if (side.entrantId && side.sc && side.entrantSeasonClubId !== side.sc) entrantMismatch += 1;
          if (!side.entrantId) hasEntrantBoth = false;
        }
        if (hasEntrantBoth) withEntrantSides += 1;
      }

      return {
        total: fixtures.length,
        withEntrantSides,
        missingSeasonClub,
        missingBothSides,
        danglingEntrant,
        entrantMismatch,
      };
    });

    const orgProblems = result.missingBothSides + result.danglingEntrant + result.entrantMismatch;
    problems += orgProblems;
    console.log(
      `[${orgProblems === 0 ? "OK" : "FAIL"}] ${organization.name}: fixtures=${result.total} withEntrantSides=${result.withEntrantSides} missingSeasonClub=${result.missingSeasonClub} missingBothSides=${result.missingBothSides} danglingEntrant=${result.danglingEntrant} entrantMismatch=${result.entrantMismatch}`,
    );
  }

  console.log(problems === 0 ? "PARITY OK" : `PARITY FAILED (${problems} problems)`);
  if (problems > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
