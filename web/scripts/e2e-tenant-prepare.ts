import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createLeague } from "../src/server/onboarding/create-league";
import { allocateOrganizationPrefixes } from "@/lib/organization-prefixes";
import bcrypt from "bcryptjs";

// Two disposable organizations with their own admins, for the multi-tenant auth spec (streak v22, Prompt 2).
//
//   npx tsx scripts/e2e-tenant-prepare.ts
//
// Prints the slugs, emails and password the spec needs. It deliberately creates the organizations through createLeague()
// - the wizard's own service - so the spec is testing the same provisioning path a customer uses, not a shortcut around
// it. `--cleanup` removes everything it created.
const CLEANUP = process.argv.includes("--cleanup");
const PASSWORD = "E2E-tenant-password-2026";
const TAG = "e2e-tenant";

type Tenant = { slug: string; name: string; email: string; orgId: string; competitionSlug: string; sessionClubId: string | null };

async function ensureTenant(label: "a" | "b", competitorName: string): Promise<Tenant> {
  const slug = `${TAG}-${label}`;
  const name = `E2E Tenant ${label.toUpperCase()}`;
  const email = `e2e-tenant-${label}@ultraleagueos.test`;

  const prefixes = await prisma.$transaction((tx) => allocateOrganizationPrefixes(tx, slug));
  const organization = await prisma.organization.upsert({
    where: { slug },
    create: { name, slug, plan: "ENTERPRISE", ...prefixes },
    update: {},
    select: { id: true, slug: true },
  });

  const league = await withOrganizationContext(organization.id, (tx) =>
    createLeague(tx, {
      organizationId: organization.id,
      organizationName: name,
      organizationSlug: slug,
      sportSlug: "football",
      competitionName: `${name} Cup`,
      entrantNames: [competitorName, `${competitorName} Reserves`],
      format: "ROUND_ROBIN",
      gamesPerPairing: 1,
      startDate: new Date(),
      matchDayOffsetDays: 7,
    }),
  ).catch(async () => {
    // createLeague refuses a second competition on some plans and duplicates names; fetch the existing one instead.
    const existing = await withOrganizationContext(organization.id, (tx) => tx.competition.findFirstOrThrow({ where: { organizationId: organization.id }, select: { id: true, slug: true } }));
    return { competitionId: existing.id, slug: existing.slug, fixtures: 0, participants: 0, seasonId: "", organizationId: organization.id, kind: "team" as const };
  });

  const seasonClub = await withOrganizationContext(organization.id, (tx) =>
    tx.seasonClub.findFirst({ where: { season: { competitionId: league.competitionId } }, select: { id: true } }),
  );

  // One admin per tenant, scoped to that tenant only.
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email },
    // LEAGUE_OPERATOR, not SUPER_ADMIN: a league administrator is not a platform administrator, and the dashboard
  // deliberately lets a SUPER_ADMIN read ANY league (that is what platform admin means). Granting SUPER_ADMIN here is
  // what made the first version of the spec assert a 404 it had no right to expect - the page was behaving as designed.
  create: { email, name: `E2E Tenant ${label.toUpperCase()} Admin`, passwordHash, emailVerified: new Date(), isActive: true, role: "LEAGUE_OPERATOR" },
    update: { passwordHash, isActive: true },
    select: { id: true },
  });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id } });
  await prisma.userRoleAssignment.create({ data: { userId: user.id, role: "LEAGUE_OPERATOR", organizationId: organization.id } });

  // A member of BOTH tenants, for the "which one wins" case.
  if (label === "b") {
    const bothEmail = "e2e-tenant-both@ultraleagueos.test";
    const both = await prisma.user.upsert({
      where: { email: bothEmail },
      create: { email: bothEmail, name: "E2E Both Admin", passwordHash, emailVerified: new Date(), isActive: true, role: "LEAGUE_OPERATOR" },
      update: { passwordHash, isActive: true },
      select: { id: true },
    });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: both.id } });
    const tenantA = await prisma.organization.findUniqueOrThrow({ where: { slug: `${TAG}-a` }, select: { id: true } });
    // A has the OLDER grant, so it is the one resolveActiveOrganizationId() picks - which is what the third test pins.
    await prisma.userRoleAssignment.create({ data: { userId: both.id, role: "LEAGUE_OPERATOR", organizationId: tenantA.id } });
    await prisma.userRoleAssignment.create({ data: { userId: both.id, role: "LEAGUE_OPERATOR", organizationId: organization.id } });
  }

  return { slug: organization.slug, name, email, orgId: organization.id, competitionSlug: league.slug, sessionClubId: seasonClub?.id ?? null };
}

async function main() {
  if (CLEANUP) {
    for (const slug of [`${TAG}-a`, `${TAG}-b`]) {
      const organization = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
      if (!organization) continue;
      await prisma.userRoleAssignment.deleteMany({ where: { organizationId: organization.id } });
      await prisma.auditLog.deleteMany({ where: { organizationId: organization.id } });
      await withOrganizationContext(organization.id, async (tx) => {
        await tx.fixture.deleteMany({ where: { organizationId: organization.id } });
        await tx.seasonClub.deleteMany({ where: { organizationId: organization.id } });
        await tx.season.deleteMany({ where: { organizationId: organization.id } });
        await tx.division.deleteMany({ where: { organizationId: organization.id } });
        await tx.competition.deleteMany({ where: { organizationId: organization.id } });
        await tx.club.deleteMany({ where: { organizationId: organization.id } });
      });
      await prisma.publicIdCounter.deleteMany({ where: { organizationId: organization.id } });
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await prisma.organization.delete({ where: { id: organization.id } });
          break;
        } catch (error) {
          const match = /`([A-Za-z_][A-Za-z0-9_]*)_organizationId_fkey`/.exec(error instanceof Error ? error.message : "");
          if (!match) break;
          await prisma.$executeRawUnsafe(`DELETE FROM "${match[1]}" WHERE "organizationId" = $1`, organization.id).catch(() => 0);
        }
      }
      console.error(`cleaned ${slug}`);
    }
    await prisma.user.deleteMany({ where: { email: { endsWith: "@ultraleagueos.test" } } });
    console.error("cleaned e2e tenant users");
    return;
  }

  const a = await ensureTenant("a", "Tenant A FC");
  const b = await ensureTenant("b", "Tenant B FC");

  console.log(`E2E_TENANT_A_SLUG=${a.slug}`);
  console.log(`E2E_TENANT_A_EMAIL=${a.email}`);
  console.log(`E2E_TENANT_B_SLUG=${b.slug}`);
  console.log(`E2E_TENANT_B_EMAIL=${b.email}`);
  console.log(`E2E_TENANT_BOTH_EMAIL=e2e-tenant-both@ultraleagueos.test`);
  console.log(`E2E_TENANT_PASSWORD=${PASSWORD}`);
  console.error(`prepared: ${a.slug} (${a.email}) · ${b.slug} (${b.email})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
