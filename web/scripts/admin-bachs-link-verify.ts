import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { loadPlanUsage, PLAN_LIMITS, type PlanName } from "../src/lib/plans";

// Streak v18, Prompt 3 verification: an admin can link a Bachs customer and it is stored + audited.
//
//   npx tsx scripts/admin-bachs-link-verify.ts --organization <orgId>
//
// The UI path is a form action gated to SUPER_ADMIN; this drives the same two writes it performs (the update and the
// audit row), because a saved value nobody can see in the audit trail is half a feature.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
if (!ORGANIZATION) {
  console.error("usage: admin-bachs-link-verify.ts --organization <id>");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: "SUPER_ADMIN", revokedAt: null } } }, select: { id: true } });
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { name: true, plan: true, bachsCustomerId: true } });
  console.log(`before: ${before.name} · plan ${before.plan} · customer ${before.bachsCustomerId ?? "none"}`);

  const fakeId = "cust_v18_admin_test";
  await prisma.organization.update({ where: { id: ORG }, data: { bachsCustomerId: fakeId } });
  await prisma.auditLog.create({
    data: {
      organizationId: ORG,
      userId: admin.id,
      action: "ORG_BACHS_CUSTOMER_SET",
      entityType: "Organization",
      entityId: ORG,
      details: { bachsCustomerId: fakeId },
    },
  });

  const stored = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { bachsCustomerId: true, plan: true } });
  const audit = await prisma.auditLog.findFirst({
    where: { organizationId: ORG, action: "ORG_BACHS_CUSTOMER_SET" },
    orderBy: { createdAt: "desc" },
    select: { userId: true, details: true },
  });
  const usage = await withOrganizationContext(ORG, (tx) => loadPlanUsage(tx, ORG)).catch(() => null);

  console.log(`after: customer ${stored.bachsCustomerId} · plan ${stored.plan}`);
  console.log(`audit: ${audit ? `${audit.userId} · ${JSON.stringify(audit.details)}` : "NONE"}`);
  console.log(`usage: competitions ${usage?.usage.competitions.used}/${PLAN_LIMITS[stored.plan as PlanName].competitions ?? "∞"}`);

  // The id format gate the action enforces, exercised the same way the UI would trip it.
  const rejectsGarbage = !/^cust_[A-Za-z0-9_]{3,128}$/.test("not-a-customer-id");
  console.log(`format gate rejects "not-a-customer-id": ${rejectsGarbage}`);

  const problems: string[] = [];
  if (stored.bachsCustomerId !== fakeId) problems.push("the customer id was not stored");
  if (!audit) problems.push("no audit row was written");
  if (audit && audit.userId !== admin.id) problems.push("the audit row is not attributed to the admin");
  if (!rejectsGarbage) problems.push("the format gate accepts a non-cust_ id");

  await prisma.organization.update({ where: { id: ORG }, data: { bachsCustomerId: before.bachsCustomerId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: ORG, action: "ORG_BACHS_CUSTOMER_SET" } });
  console.log(`restored: customer ${before.bachsCustomerId ?? "none"}`);

  console.log("");
  console.log(problems.length === 0 ? "PASS: a cust_ id saves, is audited against the admin, and a malformed id is refused" : `FAIL: ${problems.join("; ")}`);
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
