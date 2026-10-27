import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

// Clean a staging database back to its real leagues (streak v21, Prompt 4).
//
//   npx tsx scripts/cleanup-staging.ts                 # dry run: what would be deleted
//   npx tsx scripts/cleanup-staging.ts --apply
//   npx tsx scripts/cleanup-staging.ts --apply --keep neon-ultra,lagos-basketball-community-league
//
// The v18 brief referred to this script as if it existed; it did not. Staging had accumulated proof leagues, e2e
// competitions, test users and leftover tennis fixtures from four streaks of verification runs, and "clean it up by hand"
// is how a staging database becomes unrepresentative of production.
//
// What it deletes, and in this order (children before parents, or the foreign keys refuse):
//   * organizations not in the keep list, with every row that belongs to them;
//   * inside the kept organizations: competitions whose slug starts with a test prefix (e2e-, tennis-verify-, proof-),
//     the fixtures/entrants/standings under them, and the users whose email ends in @example.test / @ultraleagueos.test.
//
// It never touches a kept organization's real competitions, and it prints what it skipped.
const APPLY = process.argv.includes("--apply");
const keepArg = process.argv.indexOf("--keep");
const KEEP = (keepArg >= 0 ? process.argv[keepArg + 1] : "neon-ultra,lagos-basketball-community-league")
  .split(",")
  .map((slug) => slug.trim())
  .filter(Boolean);

const TEST_COMPETITION_PREFIXES = ["e2e-", "tennis-verify-", "proof-", "wizard-", "stress-"];
const TEST_EMAIL_SUFFIXES = ["@example.test", "@ultraleagueos.test"];

function isTestCompetition(slug: string | null): boolean {
  if (!slug) return false;
  return TEST_COMPETITION_PREFIXES.some((prefix) => slug.startsWith(prefix));
}

function isTestUser(email: string): boolean {
  return TEST_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix));
}

async function main() {
  console.log(`keep: ${KEEP.join(", ")}`);
  console.log(APPLY ? "mode: APPLY" : "mode: DRY RUN");

  const organizations = await prisma.organization.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, slug: true, name: true } });
  const doomedOrgs = organizations.filter((organization) => !KEEP.includes(organization.slug));
  const keptOrgs = organizations.filter((organization) => KEEP.includes(organization.slug));
  console.log(`organizations: ${organizations.length} total · ${keptOrgs.length} kept · ${doomedOrgs.length} to remove`);

  for (const organization of doomedOrgs) {
    const counts = await withOrganizationContext(organization.id, async (tx) => ({
      competitions: await tx.competition.count({ where: { organizationId: organization.id } }),
      fixtures: await tx.fixture.count({ where: { organizationId: organization.id } }),
      athletes: await tx.athlete.count({ where: { organizationId: organization.id } }),
      applications: await tx.application.count({ where: { organizationId: organization.id } }),
    }));
    console.log(`  remove ${organization.slug.padEnd(30)} ${JSON.stringify(counts)}`);
    if (!APPLY) continue;
    await withOrganizationContext(organization.id, async (tx) => {
      await tx.dataFeedDelivery.deleteMany({ where: { organizationId: organization.id } });
      await tx.dataFeedSubscription.deleteMany({ where: { organizationId: organization.id } });
      await tx.fixture.deleteMany({ where: { organizationId: organization.id } });
      await tx.standing.deleteMany({ where: { organizationId: organization.id } });
      await tx.application.deleteMany({ where: { organizationId: organization.id } });
      await tx.athlete.deleteMany({ where: { organizationId: organization.id } });
      await tx.entrant.deleteMany({ where: { organizationId: organization.id } });
      await tx.seasonClub.deleteMany({ where: { organizationId: organization.id } });
      await tx.season.deleteMany({ where: { organizationId: organization.id } });
      await tx.division.deleteMany({ where: { organizationId: organization.id } });
      await tx.competition.deleteMany({ where: { organizationId: organization.id } });
      await tx.club.deleteMany({ where: { organizationId: organization.id } });
    });
    await prisma.userRoleAssignment.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } }).catch((error) => console.log(`    (could not delete organization: ${(error as Error).message.split("\n")[0]})`));
  }

  console.log("");
  for (const slug of KEEP) {
    const organization = organizations.find((row) => row.slug === slug);
    if (!organization) continue;
    const competitions = await withOrganizationContext(organization.id, (tx) =>
      tx.competition.findMany({ where: { organizationId: organization.id }, select: { id: true, slug: true, name: true } }),
    );
    const doomed = competitions.filter((competition) => isTestCompetition(competition.slug));
    const kept = competitions.filter((competition) => !isTestCompetition(competition.slug));
    console.log(`${slug}: ${kept.length} real competition(s) kept, ${doomed.length} test competition(s) to remove`);
    for (const competition of doomed) {
      console.log(`  remove ${competition.slug}`);
      if (!APPLY) continue;
      const fixtures = await withOrganizationContext(organization.id, (tx) => tx.fixture.findMany({ where: { organizationId: organization.id }, select: { id: true, divisionId: true } }));
      const divisions = await withOrganizationContext(organization.id, (tx) => tx.division.findMany({ where: { competitionId: competition.id }, select: { id: true } }));
      const divisionIds = new Set(divisions.map((division) => division.id));
      const doomedFixtures = fixtures.filter((fixture) => divisionIds.has(fixture.divisionId));
      await withOrganizationContext(organization.id, async (tx) => {
        for (const fixture of doomedFixtures) await tx.fixture.delete({ where: { id: fixture.id } });
        await tx.season.deleteMany({ where: { competitionId: competition.id } });
        await tx.division.deleteMany({ where: { competitionId: competition.id } });
        await tx.competition.delete({ where: { id: competition.id } });
      });
    }
    // The season clubs created for test competitions are referenced by clubs with test-looking names.
    if (APPLY) {
      await withOrganizationContext(organization.id, async (tx) => {
        const testClubs = await tx.club.findMany({ where: { organizationId: organization.id, OR: [{ name: { startsWith: "E2E " } }, { name: { startsWith: "Admin " } }, { name: { startsWith: "Blocked " } }] }, select: { id: true } });
        for (const club of testClubs) {
          await tx.seasonClub.deleteMany({ where: { clubId: club.id } });
          await tx.club.delete({ where: { id: club.id } }).catch(() => null);
        }
      });
    }
  }

  console.log("");
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const doomedUsers = users.filter((user) => isTestUser(user.email));
  console.log(`test users: ${doomedUsers.length} (${doomedUsers.map((user) => user.email).join(", ") || "none"})`);
  if (APPLY) {
    for (const user of doomedUsers) {
      await prisma.userRoleAssignment.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => null);
      await prisma.user.delete({ where: { id: user.id } }).catch((error) => console.log(`  (kept ${user.email}: ${(error as Error).message.split("\n")[0]})`));
    }
  }

  console.log("");
  if (!APPLY) {
    console.log("dry run: nothing was deleted. Re-run with --apply.");
    return;
  }
  const remaining = await prisma.organization.findMany({ select: { slug: true } });
  console.log(`after: ${remaining.length} organization(s): ${remaining.map((row) => row.slug).join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
