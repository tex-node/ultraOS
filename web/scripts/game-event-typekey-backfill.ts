// Multi-sport Stage 6 (S6.1 backfill): map legacy GameEvent.eventType to the sport-definition
// event catalog key (typeKey).
//
// Idempotent: only writes events whose typeKey is null. SCORE maps to SHOT_MADE; everything else
// maps to its own name. An event whose mapped key is not in the sport catalog is skipped.
//
// Dry-run by default. Pass --apply to write. Runs per organization through withOrganizationContext.
//
// Usage:
//   tsx scripts/game-event-typekey-backfill.ts
//   tsx scripts/game-event-typekey-backfill.ts --apply
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { eventDefinitionFor, legacyEventTypeToKey } from "../src/lib/sports/event-catalog";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = flag("apply");
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} organizations=${organizations.length}`);

  const totals = { updated: 0, skipped: 0 };

  for (const organization of organizations) {
    await withOrganizationContext(organization.id, async (tx) => {
      const events = await tx.gameEvent.findMany({
        where: { organizationId: organization.id, typeKey: null },
        select: {
          id: true,
          eventType: true,
          game: {
            select: {
              fixture: {
                select: { division: { select: { competition: { select: { sport: { select: { slug: true } } } } } } },
              },
            },
          },
        },
      });

      let updated = 0;
      let skipped = 0;
      for (const event of events) {
        const definition = getSportDefinition(event.game.fixture.division.competition.sport.slug);
        if (!definition) {
          skipped += 1;
          continue;
        }
        const typeKey = legacyEventTypeToKey(event.eventType);
        if (!eventDefinitionFor(definition, typeKey)) {
          skipped += 1;
          continue;
        }
        if (apply) {
          await tx.gameEvent.update({ where: { id: event.id }, data: { typeKey } });
        }
        updated += 1;
      }

      totals.updated += updated;
      totals.skipped += skipped;
      console.log(`  ${organization.name}: pending=${events.length} updated=${updated} skipped=${skipped}`);
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
