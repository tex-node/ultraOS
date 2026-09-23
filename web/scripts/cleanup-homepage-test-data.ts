// One-off (2026-09-23): removes smoke-test clutter from the public homepage and fixes
// Ultra Basketball's season data so only real tournaments show correctly.
//
// 1. Hides the 4 "ZZTEST *" competitions (isActive: false) - a smoke-test run on 2026-09-20
//    created these directly against production, each left with a stray LIVE fixture.
// 2. Deletes the single fake fixture ("ZZ Test VB A" vs "ZZ Test VB B") planted inside the
//    real GIESM 2026 Volleyball Championship competition by the same smoke-test run - this
//    is what made GIESM read as LIVE instead of Upcoming. Cascades to its Game/stats rows
//    (Game.fixture is onDelete: Cascade).
// 3. Marks Ultra Basketball's "Season Zero 2026" season COMPLETED (it was still ACTIVE in
//    the data despite being finished - this is what tournamentStatusFromFixtureStatuses now
//    requires to ever show "Completed").
// 4. Creates "Season One 2026" under Ultra Basketball as a placeholder (no clubs/fixtures
//    yet) with its real announced dates.
//
// Usage: npx tsx scripts/cleanup-homepage-test-data.ts <organizationId> [--apply]
import { prisma } from "../src/lib/prisma";
import { withOrganizationContext } from "../src/lib/tenant-context";

const ZZTEST_SLUGS = ["zztest-soccer", "zztest-gridiron", "zztest-tennis", "zztest-table-tennis"];

async function main() {
  const [organizationId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!organizationId) {
    console.error("Usage: npx tsx scripts/cleanup-homepage-test-data.ts <organizationId> [--apply]");
    process.exitCode = 1;
    return;
  }
  console.log(apply ? "Mode: APPLY (will write)" : "Mode: DRY RUN (no writes - pass --apply to write)");

  await withOrganizationContext(organizationId, async (tx) => {
    const zztest = await tx.competition.findMany({
      where: { organizationId, slug: { in: ZZTEST_SLUGS } },
      select: { id: true, name: true, slug: true, isActive: true },
    });
    console.log(`\nZZTEST competitions to hide (${zztest.length}):`);
    for (const c of zztest) console.log(`  ${c.name} (${c.slug}) isActive=${c.isActive}`);

    const strayFixture = await tx.fixture.findUnique({
      where: { id: "zztest-vb" },
      select: { id: true, status: true, season: { select: { competition: { select: { name: true, slug: true } } } } },
    });
    console.log(`\nStray fixture to delete: ${strayFixture ? `${strayFixture.id} (status=${strayFixture.status}) in ${strayFixture.season.competition.name}` : "NOT FOUND (already removed?)"}`);

    const ultraBasketball = await tx.competition.findFirst({
      where: { organizationId, slug: "ultra-basketball" },
      select: { id: true, organizationId: true, seasons: { select: { id: true, name: true, status: true } } },
    });
    console.log(`\nUltra Basketball seasons:`, ultraBasketball?.seasons);

    if (!apply) {
      console.log("\nDry run only - no writes made.");
      return;
    }

    await tx.competition.updateMany({ where: { organizationId, slug: { in: ZZTEST_SLUGS } }, data: { isActive: false } });
    console.log(`\nHid ${zztest.length} ZZTEST competitions.`);

    if (strayFixture) {
      await tx.fixture.delete({ where: { id: "zztest-vb" } });
      console.log("Deleted stray GIESM test fixture.");
    }

    if (ultraBasketball) {
      const seasonZero = ultraBasketball.seasons.find((s) => s.name.toLowerCase().includes("season zero"));
      if (seasonZero && seasonZero.status !== "COMPLETED") {
        await tx.season.update({ where: { id: seasonZero.id }, data: { status: "COMPLETED" } });
        console.log(`Marked "${seasonZero.name}" COMPLETED.`);
      }
      const seasonOneExists = ultraBasketball.seasons.some((s) => s.name.toLowerCase().includes("season one"));
      if (!seasonOneExists) {
        const created = await tx.season.create({
          data: {
            organizationId,
            competitionId: ultraBasketball.id,
            name: "Season One 2026",
            startDate: new Date("2026-11-14T00:00:00.000Z"),
            endDate: new Date("2026-11-22T23:59:59.000Z"),
            status: "DRAFT",
          },
        });
        console.log(`Created "Season One 2026" (${created.id}), Nov 14-15 & 21-22, 2026, status=DRAFT.`);
      } else {
        console.log('"Season One" already exists - skipped creation.');
      }
    }

    console.log("\nDone.");
  });
}

main().finally(() => prisma.$disconnect());
