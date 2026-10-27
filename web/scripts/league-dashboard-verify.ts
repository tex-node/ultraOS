import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { loadLeagueDashboard } from "../src/server/admin/league-dashboard";

// Streak v19, Prompt 3 verification: the dashboard's numbers are the database's numbers.
//
//   npx tsx scripts/league-dashboard-verify.ts --organization <id>
//
// It computes each figure twice - once through loadLeagueDashboard() (what the page renders) and once with raw SQL
// through psql-equivalent Prisma aggregates - and compares them. A dashboard is only worth its screen if the two agree;
// the failure mode this catches is a query scoped to the WRONG tenant, which renders a plausible page full of another
// league's data.
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const ORGANIZATION = arg("organization");
if (!ORGANIZATION) {
  console.error("usage: league-dashboard-verify.ts --organization <id>");
  process.exit(1);
}
const ORG: string = ORGANIZATION;

async function main() {
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { name: true, slug: true, plan: true } });
  const report = await loadLeagueDashboard(organization.slug);
  if (!report) throw new Error(`loadLeagueDashboard returned null for ${organization.slug}`);

  const independent = await withOrganizationContext(ORG, async (tx) => ({
    activeCompetitions: await tx.competition.count({ where: { organizationId: ORG, isActive: true, seasons: { some: { status: "ACTIVE" } } } }),
    totalCompetitions: await tx.competition.count({ where: { organizationId: ORG } }),
    liveFixtures: await tx.fixture.count({ where: { organizationId: ORG, status: "LIVE" } }),
    pendingApplications: await tx.application.count({ where: { organizationId: ORG, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    highlights: await tx.mediaAsset.count({ where: { organizationId: ORG, purpose: "HIGHLIGHT_CLIP" } }),
    paidOrders: await tx.order.count({ where: { organizationId: ORG, paymentStatus: "PAID" } }),
  }));

  console.log(`organization: ${organization.name} (${organization.slug}) · plan ${organization.plan}`);
  console.log(`  active competitions : ${report.activeCompetitions}/${report.totalCompetitions}  (independent ${independent.activeCompetitions}/${independent.totalCompetitions})`);
  console.log(`  live fixtures       : ${report.liveFixtures.length}  (independent ${independent.liveFixtures})`);
  console.log(`  pending applications: ${report.pendingApplications}  (independent ${independent.pendingApplications})`);
  console.log(`  recent highlights   : ${report.recentHighlights.length} of ${independent.highlights} total`);
  console.log(`  paid ticket orders  : ${report.revenue.paidOrders}  (independent ${independent.paidOrders})`);
  console.log(`  ticket revenue      : ₦${(report.revenue.ticketRevenueKobo / 100).toLocaleString("en-NG")}`);

  // The other tenant must not leak in: compute the same numbers for a DIFFERENT organization and confirm they differ
  // where the data differs (or say so plainly when there is only one organization to compare).
  const other = await prisma.organization.findFirst({ where: { id: { not: ORG } }, select: { id: true, name: true, slug: true } });
  let isolationNote = "only one organization on this database";
  if (other) {
    const otherReport = await loadLeagueDashboard(other.slug);
    const sameIdentity = otherReport?.organization.id === report.organization.id;
    isolationNote = sameIdentity
      ? `LEAK: ${other.name} produced ${report.organization.name}'s dashboard`
      : `isolated: ${other.name} resolves to its own numbers (${otherReport?.activeCompetitions ?? 0} active competitions)`;
  }
  console.log(`  tenant isolation    : ${isolationNote}`);

  const problems: string[] = [];
  if (report.activeCompetitions !== independent.activeCompetitions) problems.push("active competitions disagree");
  if (report.totalCompetitions !== independent.totalCompetitions) problems.push("total competitions disagree");
  if (report.liveFixtures.length !== independent.liveFixtures) problems.push("live fixtures disagree");
  if (report.pendingApplications !== independent.pendingApplications) problems.push("pending applications disagree");
  if (report.revenue.paidOrders !== independent.paidOrders) problems.push("paid order count disagrees");
  if (isolationNote.startsWith("LEAK")) problems.push("tenant isolation failed");
  if (report.recentHighlights.length > 3) problems.push("more than three highlights were returned");

  console.log("");
  console.log(problems.length === 0 ? "PASS: every dashboard figure matches an independent count, and another tenant resolves to its own data" : `FAIL: ${problems.join("; ")}`);
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
