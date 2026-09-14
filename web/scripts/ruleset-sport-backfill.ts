// Multi-sport Stage 4 (S4.3): backfill sportId + config on RuleSet and sportId/definitionVersion/
// ruleValues on GameRuleSnapshot.
//
// Idempotent: re-running only rewrites rows whose derived values differ. The legacy basketball
// columns remain authoritative; this only adds the generic, definition-linked representation.
//
// Dry-run by default. Pass --apply to write. Runs per organization through withOrganizationContext.
//
// Usage:
//   tsx scripts/ruleset-sport-backfill.ts
//   tsx scripts/ruleset-sport-backfill.ts --apply
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { resolveRuleValues, ruleConfigFromLegacy } from "../src/lib/sports/rule-values";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} organizations=${organizations.length}`);

  const totals = { ruleSets: 0, snapshots: 0, skipped: 0 };

  for (const organization of organizations) {
    await withOrganizationContext(organization.id, async (tx) => {
      const sportIdBySlug = new Map<string, string>();
      const resolveSportId = async (slug: string): Promise<string> => {
        const cached = sportIdBySlug.get(slug);
        if (cached) return cached;
        const definition = getSportDefinition(slug);
        const name = definition?.name ?? slug;
        if (apply) {
          const sport = await tx.sport.upsert({
            where: { slug },
            update: { name, isActive: true },
            create: { name, slug },
          });
          sportIdBySlug.set(slug, sport.id);
          return sport.id;
        }
        // Dry-run: no write, but keep a placeholder so lookups do not repeat.
        sportIdBySlug.set(slug, "dry-run");
        return "dry-run";
      };

      const ruleSets = await tx.ruleSet.findMany({
        select: {
          id: true,
          ultraTimeStartRemainingSeconds: true,
          ultraTimeMultiplier: true,
          fourPointBaseValue: true,
          mandatorySubstitutionPolicy: true,
          season: { select: { competition: { select: { sport: { select: { slug: true } } } } } },
        },
      });

      let ruleSetUpdates = 0;
      let skipped = 0;
      for (const ruleSet of ruleSets) {
        const slug = ruleSet.season?.competition.sport.slug;
        const definition = slug ? getSportDefinition(slug) : null;
        if (!definition) {
          skipped += 1;
          continue;
        }
        const config = ruleConfigFromLegacy(definition, ruleSet);
        if (apply) {
          const sportId = await resolveSportId(definition.slug);
          await tx.ruleSet.update({ where: { id: ruleSet.id }, data: { sportId, config } });
        }
        ruleSetUpdates += 1;
      }

      const snapshots = await tx.gameRuleSnapshot.findMany({
        select: {
          id: true,
          ultraTimeStartRemainingSeconds: true,
          ultraTimeMultiplier: true,
          fourPointBaseValue: true,
          mandatorySubstitutionPolicy: true,
          game: {
            select: {
              fixture: {
                select: { division: { select: { competition: { select: { sport: { select: { slug: true } } } } } } },
              },
            },
          },
        },
      });

      let snapshotUpdates = 0;
      for (const snapshot of snapshots) {
        const slug = snapshot.game.fixture.division.competition.sport.slug;
        const definition = getSportDefinition(slug);
        if (!definition) {
          skipped += 1;
          continue;
        }
        const config = ruleConfigFromLegacy(definition, snapshot);
        const ruleValues = resolveRuleValues(definition, config);
        if (apply) {
          const sportId = await resolveSportId(definition.slug);
          await tx.gameRuleSnapshot.update({
            where: { id: snapshot.id },
            data: { sportId, definitionVersion: definition.version, ruleValues },
          });
        }
        snapshotUpdates += 1;
      }

      totals.ruleSets += ruleSetUpdates;
      totals.snapshots += snapshotUpdates;
      totals.skipped += skipped;
      console.log(
        `  ${organization.name}: ruleSets=${ruleSets.length} updated=${ruleSetUpdates} snapshots=${snapshots.length} updated=${snapshotUpdates} skipped=${skipped}`,
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
