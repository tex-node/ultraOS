// Multi-sport Stage 7 (S7.2): backfill registration sport identity.
//
// Ensures a Sport catalog row exists for each RegistrationSport slug, sets
// RegistrationParticipantSport.sportId from the enum, and mirrors RegistrationForm.sports into
// RegistrationForm.sportIds. Idempotent. The enum remains authoritative.
//
// Dry-run by default. Pass --apply to write. Tenant tables are handled per organization through
// withOrganizationContext.
//
// Usage:
//   tsx scripts/registration-sport-unify-backfill.ts
//   tsx scripts/registration-sport-unify-backfill.ts --apply
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { REGISTRATION_SPORT_SLUGS } from "../src/lib/registration/sport-identity";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function prettyName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

async function main() {
  const apply = flag("apply");

  const sportIdBySlug = new Map<string, string>();
  for (const slug of Object.values(REGISTRATION_SPORT_SLUGS)) {
    if (apply) {
      const sport = await prisma.sport.upsert({
        where: { slug },
        update: { name: prettyName(slug), isActive: true },
        create: { name: prettyName(slug), slug },
      });
      sportIdBySlug.set(slug, sport.id);
    } else {
      sportIdBySlug.set(slug, "dry-run");
    }
  }

  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`mode=${apply ? "APPLY" : "DRY-RUN"} organizations=${organizations.length}`);

  const totals = { participantSports: 0, forms: 0 };

  for (const organization of organizations) {
    await withOrganizationContext(organization.id, async (tx) => {
      const participantSports = await tx.registrationParticipantSport.findMany({
        where: { organizationId: organization.id },
        select: { id: true, sport: true, sportId: true },
      });

      let participantSportUpdates = 0;
      for (const entry of participantSports) {
        const slug = REGISTRATION_SPORT_SLUGS[entry.sport];
        const sportId = sportIdBySlug.get(slug);
        if (!sportId || entry.sportId === sportId) continue;
        if (apply) {
          await tx.registrationParticipantSport.update({ where: { id: entry.id }, data: { sportId } });
        }
        participantSportUpdates += 1;
      }

      const forms = await tx.registrationForm.findMany({
        where: { organizationId: organization.id },
        select: { id: true, sports: true, sportIds: true },
      });

      let formUpdates = 0;
      for (const form of forms) {
        const ids = [
          ...new Set(
            form.sports
              .map((sport) => sportIdBySlug.get(REGISTRATION_SPORT_SLUGS[sport]))
              .filter((value): value is string => Boolean(value)),
          ),
        ];
        if (sameIds(ids, form.sportIds)) continue;
        if (apply) {
          await tx.registrationForm.update({ where: { id: form.id }, data: { sportIds: ids } });
        }
        formUpdates += 1;
      }

      totals.participantSports += participantSportUpdates;
      totals.forms += formUpdates;
      console.log(
        `  ${organization.name}: participantSports=${participantSports.length} updated=${participantSportUpdates} forms=${forms.length} updated=${formUpdates}`,
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
