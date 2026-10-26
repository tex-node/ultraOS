import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { assertWithinPlan, loadPlanUsage, PlanLimitError, type PlanName } from "../src/lib/plans";
import { createLeague } from "../src/server/onboarding/create-league";

// Streak v17, Prompt 3 verification: an admin plan change actually lifts the limits.
//
//   npx tsx scripts/admin-plan-verify.ts --organization <orgId>
//
// It drives the same two things the admin page drives: a plan write, and the enforcement path. The plan is written the
// way setOrganizationPlanAction writes it (one column, audited), then assertWithinPlan is asked again - if a manual
// upgrade did not bypass the limit, an operator could not fix a paying customer's account, which is the whole point.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
if (!ORGANIZATION) {
  console.error("usage: admin-plan-verify.ts --organization <id>");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function blocked(resource: "competitions" | "apiKeys" | "webhooks"): Promise<boolean> {
  try {
    await withOrganizationContext(ORG, (tx) => assertWithinPlan(tx, ORG, resource));
    return false;
  } catch (error) {
    return error instanceof PlanLimitError;
  }
}

async function main() {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { name: true, plan: true } });
  const admin = await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: "SUPER_ADMIN", revokedAt: null } } }, select: { id: true } });
  console.log(`organization: ${before.name} · plan ${before.plan}`);

  // 1. Force FREE and confirm the limits bite.
  await prisma.organization.update({ where: { id: ORG }, data: { plan: "FREE" } });
  const freeBlocked = { competitions: await blocked("competitions"), apiKeys: await blocked("apiKeys"), webhooks: await blocked("webhooks") };
  console.log(`FREE: blocked competitions=${freeBlocked.competitions} apiKeys=${freeBlocked.apiKeys} webhooks=${freeBlocked.webhooks}`);

  // 2. The exact write setOrganizationPlanAction performs: one column, plus an audit row attributed to the admin.
  await prisma.organization.update({ where: { id: ORG }, data: { plan: "PRO" as PlanName } });
  await withOrganizationContext(ORG, (tx) =>
    tx.auditLog.create({
      data: {
        organizationId: ORG,
        userId: admin.id,
        action: "BILLING_PLAN_CHANGED_BY_ADMIN",
        entityType: "Organization",
        entityId: ORG,
        details: { from: "FREE", to: "PRO", organizationName: before.name },
      },
    }),
  );
  const afterUsage = await withOrganizationContext(ORG, (tx) => loadPlanUsage(tx, ORG));
  const proBlocked = { competitions: await blocked("competitions"), apiKeys: await blocked("apiKeys"), webhooks: await blocked("webhooks") };
  console.log(`PRO: plan=${afterUsage.plan} blocked competitions=${proBlocked.competitions} apiKeys=${proBlocked.apiKeys} webhooks=${proBlocked.webhooks}`);

  // 3. A PRO organization can actually create the competition that FREE refused.
  let wizardWorked = false;
  try {
    const created = await withOrganizationContext(ORG, (tx) =>
      createLeague(tx, {
        organizationId: ORG,
        organizationName: "ignored",
        organizationSlug: "ignored",
        sportSlug: "football",
        competitionName: `Admin plan check ${Date.now().toString(36)}`,
        entrantNames: ["Admin A", "Admin B"],
        format: "ROUND_ROBIN",
        gamesPerPairing: 1,
        startDate: new Date(),
        matchDayOffsetDays: 7,
      }),
    );
    wizardWorked = created.fixtures > 0;
    await withOrganizationContext(ORG, async (tx) => {
      await tx.fixture.deleteMany({ where: { seasonId: created.seasonId } });
      await tx.seasonClub.deleteMany({ where: { seasonId: created.seasonId } });
      await tx.season.deleteMany({ where: { id: created.seasonId } });
      await tx.division.deleteMany({ where: { competitionId: created.competitionId } });
      await tx.competition.deleteMany({ where: { id: created.competitionId } });
      await tx.club.deleteMany({ where: { organizationId: ORG, name: { in: ["Admin A", "Admin B"] } } });
    });
  } catch (error) {
    console.log(`  the wizard still failed on PRO: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log(`PRO wizard: competition created = ${wizardWorked}, then cleaned up`);

  // Restore.
  await prisma.organization.update({ where: { id: ORG }, data: { plan: before.plan } });
  console.log(`restored plan: ${before.plan}`);

  const problems: string[] = [];
  if (!freeBlocked.competitions || !freeBlocked.apiKeys || !freeBlocked.webhooks) problems.push("FREE did not block all three limits");
  if (proBlocked.competitions || proBlocked.apiKeys || proBlocked.webhooks) problems.push("an admin upgrade to PRO did not lift the limits");
  if (!wizardWorked) problems.push("a PRO organization still could not create a competition");
  if (afterUsage.plan !== "PRO") problems.push(`the plan read back as ${afterUsage.plan} after the change`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: FREE blocks all three limits; an admin change to PRO lifts them and the wizard works" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
