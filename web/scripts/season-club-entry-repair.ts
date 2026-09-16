// Repairs teams that are only half-entered.
//
// Two entry paths historically drifted: the competition's team form created Club + SeasonClub +
// Entrant but no Standing, and the club's season form created SeasonClub + Standing but no Entrant.
// Since fixture sides and standings are entrant keyed, a team missing either half is effectively
// absent from fixtures/standings. This walks every SeasonClub and fills in whatever is missing, using
// the same idempotent helper the app now uses.
//
// Dry-run by default. Pass --apply to write. Runs through withOrganizationContext so RLS applies per
// organization.
//
// Usage:
//   npm run teams:entry-repair            # dry-run, nothing written
//   npm run teams:entry-repair -- --apply # write
import { prisma } from "../src/lib/prisma";
import { ensureSeasonClubEntry } from "../src/lib/season-club-entry";
import { withOrganizationContext } from "../src/lib/tenant-context";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} organizations=${organizations.length}`);

  const totals = { seasonClubs: 0, missingEntrant: 0, missingStanding: 0, repaired: 0 };

  for (const organization of organizations) {
    await withOrganizationContext(organization.id, async (tx) => {
      const seasonClubs = await tx.seasonClub.findMany({
        where: { organizationId: organization.id },
        select: {
          id: true,
          seasonId: true,
          divisionId: true,
          clubId: true,
          season: { select: { competitionId: true } },
        },
      });

      for (const seasonClub of seasonClubs) {
        totals.seasonClubs += 1;
        const [entrant, standing] = await Promise.all([
          tx.entrant.findUnique({ where: { seasonClubId: seasonClub.id }, select: { id: true } }),
          tx.standing.findFirst({
            where: { seasonId: seasonClub.seasonId, seasonClubId: seasonClub.id },
            select: { id: true },
          }),
        ]);
        if (entrant && standing) continue;

        if (!entrant) totals.missingEntrant += 1;
        if (!standing) totals.missingStanding += 1;
        totals.repaired += 1;

        if (!apply) continue;
        await ensureSeasonClubEntry(tx, {
          organizationId: organization.id,
          competitionId: seasonClub.season.competitionId,
          seasonId: seasonClub.seasonId,
          divisionId: seasonClub.divisionId,
          clubId: seasonClub.clubId,
        });
      }
    });
  }

  console.log(JSON.stringify(totals, null, 2));
  if (!apply) {
    console.log("dry-run: nothing written. Re-run with --apply to repair.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
