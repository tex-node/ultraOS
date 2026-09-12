import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Phase 1 Stage 5.1: every one of the 594 UserRoleAssignment rows created before G.22's
// Organization existed is still organizationId = NULL ("platform-level" per Stage 0's design).
// In reality, every one of them - FAN, PLAYER, COACH, SUPER_ADMIN, everything - has only ever
// been exercised within Neon Ultra's context. Leaving them NULL means there is no real,
// non-guessed way to resolve "which organization is this user acting in" for session purposes.
//
// This backfill makes that data honest: every existing grant becomes explicitly scoped to Neon
// Ultra. The NULL/platform-level mechanism itself is untouched and still valid - a future grant
// can still be created with organizationId = null for a genuine cross-org platform operator
// account. This only corrects EXISTING rows that were never really platform-level, just
// created before there was an organization to scope them to.

const ORG_SLUG = "neon-ultra";

async function main() {
  const apply = process.argv.includes("--apply");
  const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (!org) {
    throw new Error(`Organization with slug "${ORG_SLUG}" not found - run Stage 2's backfill first.`);
  }

  const nullCount = await prisma.userRoleAssignment.count({ where: { organizationId: null } });

  if (!apply) {
    console.log("DRY RUN - no writes will be made. Pass --apply to actually backfill.\n");
    console.log(`Target organization: ${org.name} (${org.id})`);
    console.log(`UserRoleAssignment rows with organizationId = NULL: ${nullCount}`);
    return;
  }

  const result = await prisma.userRoleAssignment.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`Backfilled ${result.count} UserRoleAssignment rows to organization ${org.id} (${org.name}).`);

  const remaining = await prisma.userRoleAssignment.count({ where: { organizationId: null } });
  if (remaining === 0) {
    console.log("Verification passed: zero NULL organizationId rows remain on UserRoleAssignment.");
  } else {
    console.error(`Verification FAILED: ${remaining} rows still NULL.`);
    process.exitCode = 1;
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
