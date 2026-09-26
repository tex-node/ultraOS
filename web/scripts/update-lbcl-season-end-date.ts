// One-off (2026-09-26): ensureSeason() only finds-or-creates a Season by name, so adding
// Games 11-15 (which extend LBCL's "2026 Season" through Sep 26) never updated the existing
// Season row's endDate (still Sep 20 from the original 10-game ingestion). Corrects it directly.
//
// Usage: npx tsx scripts/update-lbcl-season-end-date.ts <organizationId> [--apply]
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

const NEW_END_DATE = new Date("2026-09-26T00:00:00.000Z");

async function main() {
  const [organizationId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!organizationId) {
    console.error("Usage: npx tsx scripts/update-lbcl-season-end-date.ts <organizationId> [--apply]");
    process.exitCode = 1;
    return;
  }

  await withOrganizationContext(organizationId, async (tx) => {
    const season = await tx.season.findFirst({
      where: { organizationId, name: "2026 Season" },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!season) {
      console.log("No season named '2026 Season' found for this organization.");
      return;
    }
    console.log(`Found: ${season.name} (${season.id}) ${season.startDate.toISOString()} - ${season.endDate.toISOString()}`);
    if (season.endDate.getTime() === NEW_END_DATE.getTime()) {
      console.log("endDate already correct - nothing to do.");
      return;
    }
    if (!apply) {
      console.log(`Dry run: would update endDate to ${NEW_END_DATE.toISOString()}. Pass --apply to write.`);
      return;
    }
    await tx.season.update({ where: { id: season.id }, data: { endDate: NEW_END_DATE } });
    console.log(`Updated endDate to ${NEW_END_DATE.toISOString()}.`);
  });
}

main().finally(() => prisma.$disconnect());
