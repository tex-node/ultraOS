import { prisma } from "../src/lib/prisma";
import { allocateOrganizationPrefixes } from "../src/lib/organization-prefixes";

// Minimal, deterministic seed for the local browser suite.
//
// NOT the demo seed. That one builds a whole league season, which is right for a human looking at the app and wrong for a
// test harness: it would make the suite slower, and it would quietly supply state the specs are supposed to create
// themselves. This seeds only the things the preparation scripts assume already exist - organizations, the sports the wizard
// and the console branch on, and a venue (a fixture cannot be created without one).
//
// Everything is an upsert, so running it twice is free.
const ORG_SLUG = process.env.E2E_ORG_SLUG ?? "e2e-league";

/** Organizations carry unique athlete/team prefix sequences, so they cannot be created with bare defaults. */
async function ensureOrganization(slug: string, name: string) {
  const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
  if (existing) return existing;
  const prefixes = await prisma.$transaction((tx) => allocateOrganizationPrefixes(tx, slug));
  return prisma.organization.create({ data: { name, slug, ...prefixes }, select: { id: true, slug: true, name: true } });
}

async function main() {
  const organization = await ensureOrganization(ORG_SLUG, "E2E League");

  // The FREE plan caps a tenant at one competition, and e2e-prepare already creates one - so the wizard spec hit "The FREE plan
  // allows 1 competition(s)" instead of a success message. The test tenant is ENTERPRISE on purpose: its plan is not what any
  // spec is asserting, and a quota is not the thing under test.
  await prisma.organization.update({ where: { slug: ORG_SLUG }, data: { plan: "ENTERPRISE" } });

  // The public homepage resolves the tenant through a hardcoded slug ("neon-ultra", tenant-context.ts). Without that row the
  // homepage throws OrganizationNotFoundError, Playwright's webServer never sees a healthy URL, and the suite dies with a
  // 900s timeout that looks like a build problem. The row is empty on purpose: the specs never visit the public homepage.
  await ensureOrganization("neon-ultra", "Neon Ultra");

  // football drives e2e-prepare (it looks the sport up by slug and fails without it); the others exist so the wizard's
  // sport list and the console's sport branches are not starving.
  for (const [slug, name] of [
    ["football", "Football"],
    ["basketball", "Basketball"],
  ]) {
    await prisma.sport.upsert({
      where: { slug },
      update: { name, isActive: true },
      create: { name, slug },
    });
  }

  await prisma.venue.upsert({
    where: { id: "e2e-venue" },
    update: {},
    create: {
      id: "e2e-venue",
      organizationId: organization.id,
      name: "E2E Test Ground",
      address: "1 Test Way",
      city: "Lagos",
      capacity: 500,
    },
  });

  console.log(`seeded organization ${organization.slug} (${organization.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
