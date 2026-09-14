// Multi-sport Stage 6 verification: read-only parity check for the event vocabulary.
//
// Verifies that every GameEvent with a typeKey resolves to an event in its sport's catalog, and
// reports how many events still have no typeKey. Exits non-zero on any unresolved typeKey.
// Read-only; runs per organization through withOrganizationContext.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { getSportDefinition } from "../src/lib/sports/registry";
import { eventDefinitionFor } from "../src/lib/sports/event-catalog";

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  let unresolved = 0;
  let checked = 0;

  for (const organization of organizations) {
    const result = await withOrganizationContext(organization.id, async (tx) => {
      const events = await tx.gameEvent.findMany({
        where: { organizationId: organization.id },
        select: {
          id: true,
          typeKey: true,
          game: {
            select: {
              fixture: {
                select: { division: { select: { competition: { select: { sport: { select: { slug: true } } } } } } },
              },
            },
          },
        },
      });

      let orgChecked = 0;
      let orgUnresolved = 0;
      let missingTypeKey = 0;
      for (const event of events) {
        if (!event.typeKey) {
          missingTypeKey += 1;
          continue;
        }
        const definition = getSportDefinition(event.game.fixture.division.competition.sport.slug);
        if (!definition) continue;
        orgChecked += 1;
        if (!eventDefinitionFor(definition, event.typeKey)) {
          orgUnresolved += 1;
          console.error(`  UNRESOLVED event ${event.id} typeKey=${event.typeKey}`);
        }
      }
      return { orgChecked, orgUnresolved, missingTypeKey, total: events.length };
    });

    checked += result.orgChecked;
    unresolved += result.orgUnresolved;
    console.log(
      `[${result.orgUnresolved === 0 ? "OK" : "FAIL"}] ${organization.name}: total=${result.total} withTypeKey=${result.orgChecked} withoutTypeKey=${result.missingTypeKey} unresolved=${result.orgUnresolved}`,
    );
  }

  console.log(unresolved === 0 ? `PARITY OK (${checked} events checked)` : `PARITY FAILED (${unresolved} unresolved of ${checked})`);
  if (unresolved > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
