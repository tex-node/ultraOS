// Multi-sport Stage 6 (S6.2): sync the SportEventDefinition catalog from the code registry.
//
// Idempotent: upserts by (sportId, key). Sport rows are upserted by slug so an unseeded sport works.
//
// Dry-run by default. Pass --apply to write.
//
// Usage:
//   tsx scripts/sport-event-definitions-sync.ts
//   tsx scripts/sport-event-definitions-sync.ts --apply
import { prisma } from "../src/lib/prisma";
import { listSportDefinitions } from "../src/lib/sports/registry";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const definitions = listSportDefinitions();
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} sports=${definitions.length}`);

  let events = 0;
  for (const definition of definitions) {
    if (apply) {
      const sport = await prisma.sport.upsert({
        where: { slug: definition.slug },
        update: { name: definition.name, isActive: true },
        create: { name: definition.name, slug: definition.slug },
      });
      let sortOrder = 0;
      for (const event of definition.events) {
        await prisma.sportEventDefinition.upsert({
          where: { sportId_key: { sportId: sport.id, key: event.key } },
          update: {
            label: event.label,
            category: event.category,
            scores: event.scores ?? false,
            pointValues: event.pointValues ?? [],
            producesMetrics: event.producesMetrics ?? [],
            sortOrder,
          },
          create: {
            sportId: sport.id,
            key: event.key,
            label: event.label,
            category: event.category,
            scores: event.scores ?? false,
            pointValues: event.pointValues ?? [],
            producesMetrics: event.producesMetrics ?? [],
            sortOrder,
          },
        });
        sortOrder += 1;
      }
    }
    events += definition.events.length;
    console.log(`  ${definition.name}: ${definition.events.length} events`);
  }

  console.log(`done: ${events} event definitions (${apply ? "written" : "dry-run, nothing written"})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
