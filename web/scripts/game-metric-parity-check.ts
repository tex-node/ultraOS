// Multi-sport Stage 3 (S3.4): read-only parity check for the generic statistics projection.
//
// Verifies the exit criteria for Gate G3: every GameMetricValue reproduces the exact value of the
// legacy PlayerStat/TeamStat field it was projected from. Read-only; exits non-zero on any
// mismatch. Runs per organization through withOrganizationContext.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  let mismatches = 0;
  let checked = 0;

  for (const organization of organizations) {
    const result = await withOrganizationContext(organization.id, async (tx) => {
      const entrants = await tx.entrant.findMany({
        where: { organizationId: organization.id },
        select: { id: true, seasonClubId: true },
      });
      const seasonClubByEntrant = new Map(entrants.map((entrant) => [entrant.id, entrant.seasonClubId]));

      const games = await tx.game.findMany({
        where: { organizationId: organization.id },
        select: {
          id: true,
          playerStats: true,
          teamStats: true,
          metricValues: { include: { metricDefinition: { select: { key: true, subject: true } } } },
        },
      });

      let orgChecked = 0;
      let orgMismatches = 0;

      for (const game of games) {
        const playerStatById = new Map(game.playerStats.map((stat) => [stat.playerId, stat as Record<string, unknown>]));
        const teamStatBySeasonClub = new Map(game.teamStats.map((stat) => [stat.seasonClubId, stat as Record<string, unknown>]));

        for (const metric of game.metricValues) {
          const key = metric.metricDefinition.key;
          const expected = Number(metric.value);
          let legacy: unknown;
          if (metric.subjectType === "PLAYER" && metric.playerId) {
            legacy = playerStatById.get(metric.playerId)?.[key];
          } else if (metric.subjectType === "ENTRANT" && metric.entrantId) {
            const seasonClubId = seasonClubByEntrant.get(metric.entrantId);
            legacy = seasonClubId ? teamStatBySeasonClub.get(seasonClubId)?.[key] : undefined;
          } else {
            continue;
          }

          if (legacy === undefined || legacy === null) continue;
          orgChecked += 1;
          if (Number(legacy) !== expected) {
            orgMismatches += 1;
            console.error(
              `  MISMATCH game=${game.id} subject=${metric.subjectType} key=${key} legacy=${String(legacy)} projected=${expected}`,
            );
          }
        }
      }

      return { orgChecked, orgMismatches };
    });

    checked += result.orgChecked;
    mismatches += result.orgMismatches;
    console.log(`[${result.orgMismatches === 0 ? "OK" : "FAIL"}] ${organization.name}: checked=${result.orgChecked} mismatches=${result.orgMismatches}`);
  }

  console.log(mismatches === 0 ? `PARITY OK (${checked} values compared)` : `PARITY FAILED (${mismatches} mismatches of ${checked})`);
  if (mismatches > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
