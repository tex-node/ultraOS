// Multi-sport Stage 3 (S3.2): sync the SportMetricDefinition catalog from the code registry.
//
// The registry (web/src/lib/sports) is the authority; this materializes each definition's metrics
// into the global SportMetricDefinition table so GameMetricValue rows can reference them by id.
// Idempotent: upserts by (sportId, subject, key).
//
// Dry-run by default. Pass --apply to write. Sport rows are upserted by slug like the tournament
// onboarding flow does, so a sport that was never seeded still works.
//
// Usage:
//   tsx scripts/sport-metric-definitions-sync.ts
//   tsx scripts/sport-metric-definitions-sync.ts --apply
import { prisma } from "../src/lib/prisma";
import { listSportDefinitions } from "../src/lib/sports/registry";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const definitions = listSportDefinitions();
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} sports=${definitions.length}`);

  let metrics = 0;
  for (const definition of definitions) {
    if (apply) {
      const sport = await prisma.sport.upsert({
        where: { slug: definition.slug },
        update: { name: definition.name, isActive: true },
        create: { name: definition.name, slug: definition.slug },
      });
      for (const metric of definition.metrics) {
        await prisma.sportMetricDefinition.upsert({
          where: { sportId_subject_key: { sportId: sport.id, subject: metric.subject, key: metric.key } },
          update: {
            label: metric.label,
            valueType: metric.valueType,
            aggregation: metric.aggregation,
            category: metric.category ?? null,
            derivedFromEventKeys: metric.derivedFromEventKeys ?? [],
            sortOrder: metric.sortOrder ?? 0,
          },
          create: {
            sportId: sport.id,
            key: metric.key,
            label: metric.label,
            valueType: metric.valueType,
            subject: metric.subject,
            aggregation: metric.aggregation,
            category: metric.category ?? null,
            derivedFromEventKeys: metric.derivedFromEventKeys ?? [],
            sortOrder: metric.sortOrder ?? 0,
          },
        });
      }
    }
    metrics += definition.metrics.length;
    console.log(`  ${definition.name}: ${definition.metrics.length} metrics`);
  }

  console.log(`done: ${metrics} metric definitions (${apply ? "written" : "dry-run, nothing written"})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
