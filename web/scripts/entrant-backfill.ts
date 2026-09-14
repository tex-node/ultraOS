// Multi-sport Stage 2 (S2.3): backfill the Entrant abstraction.
//
// Creates exactly one TEAM Entrant per existing SeasonClub and populates the nullable entrant
// references on Fixture, GameEvent, Standing, and TeamStat. Idempotent: re-running skips
// SeasonClubs that already have an entrant and only rewrites references that differ.
//
// Dry-run by default. Pass --apply to write. Runs through withOrganizationContext so RLS applies
// per organization. Never guesses an organization: it iterates the real Organization rows.
//
// Usage:
//   tsx scripts/entrant-backfill.ts            # dry-run, nothing written
//   tsx scripts/entrant-backfill.ts --apply    # write
import { prisma } from "../src/lib/prisma";
import { buildTeamEntrantFields } from "../src/lib/entrant";
import { withOrganizationContext } from "../src/lib/tenant-context";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} organizations=${organizations.length}`);

  const totals = { entrantsCreated: 0, entrantsExisting: 0, fixtures: 0, events: 0, standings: 0, teamStats: 0 };

  for (const organization of organizations) {
    await withOrganizationContext(organization.id, async (tx) => {
      const seasonClubs = await tx.seasonClub.findMany({
        where: { organizationId: organization.id },
        select: {
          id: true,
          seasonId: true,
          divisionId: true,
          season: { select: { competitionId: true } },
          club: {
            select: { name: true, shortName: true, logoUrl: true, primaryColor: true, secondaryColor: true },
          },
        },
      });

      let created = 0;
      let existing = 0;
      for (const seasonClub of seasonClubs) {
        const already = await tx.entrant.findUnique({ where: { seasonClubId: seasonClub.id }, select: { id: true } });
        if (already) {
          existing += 1;
          continue;
        }
        if (apply) {
          await tx.entrant.create({
            data: buildTeamEntrantFields({
              organizationId: organization.id,
              competitionId: seasonClub.season.competitionId,
              seasonId: seasonClub.seasonId,
              divisionId: seasonClub.divisionId,
              seasonClubId: seasonClub.id,
              club: seasonClub.club,
            }),
          });
        }
        created += 1;
      }

      totals.entrantsCreated += created;
      totals.entrantsExisting += existing;

      if (!apply) {
        const [fixtures, events, standings, teamStats] = await Promise.all([
          tx.fixture.count({ where: { organizationId: organization.id, OR: [{ homeEntrantId: null }, { awayEntrantId: null }] } }),
          tx.gameEvent.count({ where: { organizationId: organization.id, seasonClubId: { not: null }, entrantId: null } }),
          tx.standing.count({ where: { organizationId: organization.id, entrantId: null } }),
          tx.teamStat.count({ where: { organizationId: organization.id, entrantId: null } }),
        ]);
        totals.fixtures += fixtures;
        totals.events += events;
        totals.standings += standings;
        totals.teamStats += teamStats;
        console.log(
          `  ${organization.name}: seasonClubs=${seasonClubs.length} entrantsToCreate=${created} entrantsExisting=${existing} pendingRefs(fixture/event/standing/teamStat)=${fixtures}/${events}/${standings}/${teamStats}`,
        );
        return;
      }

      const homeFixtures = await tx.$executeRaw`UPDATE "Fixture" f SET "homeEntrantId" = e."id" FROM "Entrant" e WHERE e."seasonClubId" = f."homeSeasonClubId" AND e."organizationId" = ${organization.id} AND f."organizationId" = ${organization.id} AND (f."homeEntrantId" IS DISTINCT FROM e."id")`;
      const awayFixtures = await tx.$executeRaw`UPDATE "Fixture" f SET "awayEntrantId" = e."id" FROM "Entrant" e WHERE e."seasonClubId" = f."awaySeasonClubId" AND e."organizationId" = ${organization.id} AND f."organizationId" = ${organization.id} AND (f."awayEntrantId" IS DISTINCT FROM e."id")`;
      const winnerFixtures = await tx.$executeRaw`UPDATE "Fixture" f SET "winnerEntrantId" = e."id" FROM "Entrant" e WHERE e."seasonClubId" = f."winnerSeasonClubId" AND e."organizationId" = ${organization.id} AND f."organizationId" = ${organization.id} AND f."winnerSeasonClubId" IS NOT NULL AND (f."winnerEntrantId" IS DISTINCT FROM e."id")`;
      const events = await tx.$executeRaw`UPDATE "GameEvent" g SET "entrantId" = e."id" FROM "Entrant" e WHERE e."seasonClubId" = g."seasonClubId" AND e."organizationId" = ${organization.id} AND g."organizationId" = ${organization.id} AND g."seasonClubId" IS NOT NULL AND (g."entrantId" IS DISTINCT FROM e."id")`;
      const standings = await tx.$executeRaw`UPDATE "Standing" s SET "entrantId" = e."id" FROM "Entrant" e WHERE e."seasonClubId" = s."seasonClubId" AND e."organizationId" = ${organization.id} AND s."organizationId" = ${organization.id} AND (s."entrantId" IS DISTINCT FROM e."id")`;
      const teamStats = await tx.$executeRaw`UPDATE "TeamStat" t SET "entrantId" = e."id" FROM "Entrant" e WHERE e."seasonClubId" = t."seasonClubId" AND e."organizationId" = ${organization.id} AND t."organizationId" = ${organization.id} AND (t."entrantId" IS DISTINCT FROM e."id")`;

      totals.fixtures += homeFixtures + awayFixtures + winnerFixtures;
      totals.events += events;
      totals.standings += standings;
      totals.teamStats += teamStats;
      console.log(
        `  ${organization.name}: seasonClubs=${seasonClubs.length} entrantsCreated=${created} refsUpdated(fixture/event/standing/teamStat)=${homeFixtures + awayFixtures + winnerFixtures}/${events}/${standings}/${teamStats}`,
      );
    });
  }

  console.log(`done: ${JSON.stringify(totals)} (${apply ? "written" : "dry-run, nothing written"})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
