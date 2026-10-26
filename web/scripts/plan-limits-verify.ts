import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { assertWithinPlan, loadPlanUsage, PlanLimitError } from "../src/lib/plans";
import { createLeague } from "../src/server/onboarding/create-league";
import { createApiKey } from "../src/lib/api-v1/api-keys";
import { randomUUID } from "node:crypto";

// Streak v16, Prompt 3 verification: a FREE organization is stopped at its second competition.
//
//   npx tsx scripts/plan-limits-verify.ts --organization <orgId> [--keep]
//
// It does not trust a UI message: it calls the same service the wizard's action calls, twice, and asserts the second
// call throws a PlanLimitError naming competitions - and that nothing from the refused attempt was written. It also
// checks the other two limits (API keys, webhooks) the same way, because a limit enforced in one path and forgotten in
// another is the failure mode worth testing for.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
const KEEP = process.argv.includes("--keep");
if (!ORGANIZATION) {
  console.error("usage: plan-limits-verify.ts --organization <id> [--keep]");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function expectBlocked(label: string, run: () => Promise<unknown>, resource: string): Promise<boolean> {
  try {
    await run();
    console.log(`  ${label}: ALLOWED (expected a block)`);
    return false;
  } catch (error) {
    if (error instanceof PlanLimitError && error.resource === resource) {
      console.log(`  ${label}: blocked · "${error.message}"`);
      return true;
    }
    console.log(`  ${label}: threw ${error instanceof Error ? error.message : String(error)} (not a PlanLimitError)`);
    return false;
  }
}

async function main() {
  const user = await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: "SUPER_ADMIN", revokedAt: null } } }, select: { id: true } });

  const before = await withOrganizationContext(ORG, (tx) => loadPlanUsage(tx, ORG));
  console.log(`plan: ${before.plan} · competitions ${before.usage.competitions.used}/${before.usage.competitions.limit ?? "∞"} · apiKeys ${before.usage.apiKeys.used}/${before.usage.apiKeys.limit ?? "∞"} · webhooks ${before.usage.webhooks.used}/${before.usage.webhooks.limit ?? "∞"}`);

  // Force this organization to FREE for the duration of the check, remembering what it was.
  await prisma.organization.update({ where: { id: ORG }, data: { plan: "FREE" } });
  const free = await withOrganizationContext(ORG, (tx) => loadPlanUsage(tx, ORG));
  console.log(`after switching to FREE: competitions ${free.usage.competitions.used}/${free.usage.competitions.limit}`);

  const problems: string[] = [];
  const competitionCountBefore = await withOrganizationContext(ORG, (tx) => tx.competition.count({ where: { organizationId: ORG } }));

  // Competition: if the org already has a competition, the FIRST wizard attempt must already be refused.
  const blockedCompetition = await expectBlocked("second competition (wizard service)", () =>
    withOrganizationContext(ORG, (tx) =>
      createLeague(tx, {
        organizationId: ORG,
        organizationName: "ignored",
        organizationSlug: "ignored",
        sportSlug: "football",
        competitionName: `FREE plan attempt ${randomUUID().slice(0, 4)}`,
        entrantNames: ["Blocked A", "Blocked B"],
        format: "ROUND_ROBIN",
        gamesPerPairing: 1,
        startDate: new Date(),
        matchDayOffsetDays: 7,
      }),
    ), "competitions");
  if (!blockedCompetition) problems.push("a FREE organization was allowed to create another competition");

  const competitionCountAfter = await withOrganizationContext(ORG, (tx) => tx.competition.count({ where: { organizationId: ORG } }));
  if (competitionCountAfter !== competitionCountBefore) problems.push(`a refused competition still wrote rows (${competitionCountBefore} → ${competitionCountAfter})`);

  const blockedKey = await expectBlocked("API key on FREE", () =>
    withOrganizationContext(ORG, (tx) => createApiKey(tx, { organizationId: ORG, userId: user.id, name: "FREE plan key", tier: "BASIC" })),
    "apiKeys");
  if (!blockedKey) problems.push("a FREE organization was allowed an API key");

  const blockedWebhook = await expectBlocked("webhook on FREE", () =>
    withOrganizationContext(ORG, (tx) => assertWithinPlan(tx, ORG, "webhooks")),
    "webhooks");
  if (!blockedWebhook) problems.push("a FREE organization was allowed a webhook");

  // PRO: API keys and webhooks are allowed, competitions unlimited.
  await prisma.organization.update({ where: { id: ORG }, data: { plan: "PRO" } });
  const pro = await withOrganizationContext(ORG, (tx) => loadPlanUsage(tx, ORG));
  console.log(`after switching to PRO: competitions ${pro.usage.competitions.used}/${pro.usage.competitions.limit ?? "∞"} · apiKeys limit ${pro.usage.apiKeys.limit} · webhooks limit ${pro.usage.webhooks.limit}`);
  const proKeyAllowed = await (async () => {
    try {
      const key = await withOrganizationContext(ORG, (tx) => createApiKey(tx, { organizationId: ORG, userId: user.id, name: "PRO plan key", tier: "BASIC" }));
      await withOrganizationContext(ORG, (tx) => tx.apiKey.deleteMany({ where: { organizationId: ORG, name: "PRO plan key" } }));
      return true;
    } catch {
      return false;
    }
  })();
  console.log(`  API key on PRO: ${proKeyAllowed ? "allowed" : "BLOCKED (expected allowed)"}`);
  if (!proKeyAllowed) problems.push("a PRO organization was not allowed an API key");

  // Restore the plan this organization had.
  await prisma.organization.update({ where: { id: ORG }, data: { plan: before.plan } });
  console.log(`restored plan: ${before.plan}`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: FREE is limited on competitions, API keys and webhooks; PRO is not; a refused attempt writes nothing" : `FAIL: ${problems.join("; ")}`);
  if (problems.length > 0) process.exitCode = 1;
  void KEEP;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
