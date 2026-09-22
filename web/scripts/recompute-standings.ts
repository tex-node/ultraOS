// Recomputes Standing rows for every season of a given organization. Needed whenever
// competitive-scope.ts's eligibility rules change (e.g. 2026-09-22's IMPORT-origin fix) after
// fixtures were already imported and FINAL under the old rule - recalculateStandings() only
// ever runs as a side effect of a fresh game import, so a rule change alone never touches
// already-written Standing rows until this is run again.
//
// Usage: npx tsx scripts/recompute-standings.ts <organizationId>
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { recalculateStandings } from "../src/lib/standings-recalculate";

async function main() {
  const [organizationId] = process.argv.slice(2);
  if (!organizationId) {
    console.error("Usage: npx tsx scripts/recompute-standings.ts <organizationId>");
    process.exitCode = 1;
    return;
  }

  const seasons = await withOrganizationContext(organizationId, (tx) =>
    tx.season.findMany({ where: { organizationId }, select: { id: true, name: true, competition: { select: { name: true } } } }),
  );
  console.log(`Recomputing standings for ${seasons.length} season(s) in organization ${organizationId}`);

  for (const season of seasons) {
    await withOrganizationContext(organizationId, (tx) => recalculateStandings(tx, organizationId, season.id));
    console.log(`  done: ${season.competition.name} / ${season.name} (${season.id})`);
  }
  console.log("Done.");
}

main().finally(() => prisma.$disconnect());
