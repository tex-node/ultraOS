// Multi-sport Stage 3 (S3.3): compatibility projection - materialize legacy basketball
// PlayerStat/TeamStat rows into generic GameMetricValue rows.
//
// The ledger/legacy tables stay the source of truth; this writes the generic projection so the
// multi-sport read model can be validated (Gate G3). Idempotent: rows are inserted with
// skipDuplicates against the GameMetricValue unique key, so a re-run skips what already exists.
// Writes are batched (createMany) rather than one upsert per value, so a full season fits well
// inside a single interactive transaction.
//
// Requires the metric catalog to be synced first (scripts/sport-metric-definitions-sync.ts) and
// Entrants to exist (scripts/entrant-backfill.ts).
//
// Dry-run by default. Pass --apply to write. Runs per organization through withOrganizationContext.
//
// Usage:
//   tsx scripts/game-metric-backfill.ts
//   tsx scripts/game-metric-backfill.ts --apply
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { requireSportDefinition } from "../src/lib/sports/registry";
import { metricEntriesFromRecord, metricSubjectKey } from "../src/lib/sports/metric-values";
import type { SportDefinition } from "../src/lib/sports/types";
import type { Prisma } from "../src/generated/prisma/client";
import type { StatDataSource, StatSubjectType } from "../src/generated/prisma/enums";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const BATCH_SIZE = 500;

async function main() {
  const apply = flag("apply");

  // Global metric catalog: `${sportSlug}:${subject}:${key}` -> SportMetricDefinition.id
  const metricDefinitions = await prisma.sportMetricDefinition.findMany({
    include: { sport: { select: { slug: true } } },
  });
  const definitionIdByKey = new Map(
    metricDefinitions.map((metric) => [`${metric.sport.slug}:${metric.subject}:${metric.key}`, metric.id]),
  );
  if (definitionIdByKey.size === 0) {
    console.warn("No SportMetricDefinition rows found. Run scripts/sport-metric-definitions-sync.ts --apply first.");
  }

  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} metricDefinitions=${metricDefinitions.length} organizations=${organizations.length}`);

  const totals = { playerValues: 0, entrantValues: 0, skippedTeamStats: 0 };

  for (const organization of organizations) {
    await withOrganizationContext(organization.id, async (tx) => {
      const entrants = await tx.entrant.findMany({
        where: { organizationId: organization.id, seasonClubId: { not: null } },
        select: { id: true, seasonClubId: true },
      });
      const entrantBySeasonClub = new Map(entrants.map((entrant) => [entrant.seasonClubId as string, entrant.id]));

      const games = await tx.game.findMany({
        select: {
          id: true,
          fixture: {
            select: { division: { select: { competition: { select: { sport: { select: { slug: true } } } } } } },
          },
          playerStats: true,
          teamStats: true,
        },
      });

      const pending: Prisma.GameMetricValueCreateManyInput[] = [];
      let playerValues = 0;
      let entrantValues = 0;
      let skippedTeamStats = 0;

      const push = (
        sportSlug: string,
        gameId: string,
        subjectType: StatSubjectType,
        subjectId: string,
        playerId: string | null,
        entrantId: string | null,
        statSource: StatDataSource | null,
        entry: { key: string; value: number },
      ): boolean => {
        const definitionId = definitionIdByKey.get(`${sportSlug}:${subjectType}:${entry.key}`);
        if (!definitionId) return false;
        if (apply) {
          pending.push({
            organizationId: organization.id,
            gameId,
            metricDefinitionId: definitionId,
            subjectType,
            subjectKey: metricSubjectKey(subjectType, subjectId),
            playerId,
            entrantId,
            period: 0,
            value: entry.value,
            statSource,
          });
        }
        return true;
      };

      for (const game of games) {
        const sportSlug = game.fixture.division.competition.sport.slug;
        let definition: SportDefinition;
        try {
          definition = requireSportDefinition(sportSlug);
        } catch {
          continue;
        }

        for (const playerStat of game.playerStats) {
          const entries = metricEntriesFromRecord(definition, "PLAYER", playerStat as Record<string, unknown>);
          for (const entry of entries) {
            if (push(sportSlug, game.id, "PLAYER", playerStat.playerId, playerStat.playerId, null, playerStat.statSource ?? null, entry)) {
              playerValues += 1;
            }
          }
        }

        for (const teamStat of game.teamStats) {
          const entrantId = entrantBySeasonClub.get(teamStat.seasonClubId);
          if (!entrantId) {
            skippedTeamStats += 1;
            continue;
          }
          const entries = metricEntriesFromRecord(definition, "ENTRANT", teamStat as Record<string, unknown>);
          for (const entry of entries) {
            if (push(sportSlug, game.id, "ENTRANT", entrantId, null, entrantId, teamStat.statSource ?? null, entry)) {
              entrantValues += 1;
            }
          }
        }
      }

      if (apply && pending.length > 0) {
        for (let index = 0; index < pending.length; index += BATCH_SIZE) {
          await tx.gameMetricValue.createMany({ data: pending.slice(index, index + BATCH_SIZE), skipDuplicates: true });
        }
      }

      totals.playerValues += playerValues;
      totals.entrantValues += entrantValues;
      totals.skippedTeamStats += skippedTeamStats;
      console.log(
        `  ${organization.name}: games=${games.length} playerValues=${playerValues} entrantValues=${entrantValues} skippedTeamStats=${skippedTeamStats}`,
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
