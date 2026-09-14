// Multi-sport Stage 7 verification: read-only parity check for registration sport unification.
//
// Verifies that each RegistrationParticipantSport.sportId resolves to a Sport whose slug matches
// its RegistrationSport enum, and that each RegistrationForm.sportIds resolves to exactly the
// slugs its sports enum implies. Exits non-zero on any mismatch. Read-only; runs per organization
// through withOrganizationContext.
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { REGISTRATION_SPORT_SLUGS } from "../src/lib/registration/sport-identity";

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  let mismatches = 0;
  let checked = 0;

  for (const organization of organizations) {
    const result = await withOrganizationContext(organization.id, async (tx) => {
      const participantSports = await tx.registrationParticipantSport.findMany({
        where: { organizationId: organization.id },
        select: { id: true, sport: true, sportId: true, sportCatalog: { select: { slug: true } } },
      });

      let orgChecked = 0;
      let orgMismatches = 0;
      for (const entry of participantSports) {
        orgChecked += 1;
        const expectedSlug = REGISTRATION_SPORT_SLUGS[entry.sport];
        if (!entry.sportId || entry.sportCatalog?.slug !== expectedSlug) {
          orgMismatches += 1;
          console.error(
            `  MISMATCH participantSport=${entry.id} enum=${entry.sport} expected=${expectedSlug} resolved=${entry.sportCatalog?.slug ?? "none"}`,
          );
        }
      }

      const forms = await tx.registrationForm.findMany({
        where: { organizationId: organization.id },
        select: { id: true, sports: true, sportIds: true },
      });
      for (const form of forms) {
        orgChecked += 1;
        const expectedSlugs = new Set(form.sports.map((sport) => REGISTRATION_SPORT_SLUGS[sport]));
        const resolved = form.sportIds.length
          ? await tx.sport.findMany({ where: { id: { in: form.sportIds } }, select: { slug: true } })
          : [];
        const resolvedSlugs = new Set(resolved.map((sport) => sport.slug));
        const match =
          resolvedSlugs.size === expectedSlugs.size && [...expectedSlugs].every((slug) => resolvedSlugs.has(slug));
        if (!match) {
          orgMismatches += 1;
          console.error(
            `  MISMATCH form=${form.id} expectedSlugs=${[...expectedSlugs].join(",")} resolvedSlugs=${[...resolvedSlugs].join(",")}`,
          );
        }
      }

      return { orgChecked, orgMismatches };
    });

    checked += result.orgChecked;
    mismatches += result.orgMismatches;
    console.log(`[${result.orgMismatches === 0 ? "OK" : "FAIL"}] ${organization.name}: checked=${result.orgChecked} mismatches=${result.orgMismatches}`);
  }

  console.log(mismatches === 0 ? `PARITY OK (${checked} rows checked)` : `PARITY FAILED (${mismatches} mismatches of ${checked})`);
  if (mismatches > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
