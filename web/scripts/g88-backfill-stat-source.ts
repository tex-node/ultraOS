import { prisma } from "../src/lib/prisma";

// Backfills Game.statSource / PlayerStat.statSource / TeamStat.statSource for the 11 real
// Season Zero games imported via game-result-import.ts, before the statSource column existed.
// Source of truth is each Game's own already-persisted `resultSource` (a real filename like
// "FIBA Box Score APX vs FLX 15 August.pdf") — never guessed, only read back. dataCapability
// is left untouched (already correctly defaults to BOX_SCORE_ONLY from the migration).
//
// Usage: npx tsx scripts/g88-backfill-stat-source.ts [--apply]

const APPLY = process.argv.includes("--apply");

async function main() {
  const games = await prisma.game.findMany({
    where: { resultSource: { not: null }, statSource: null },
    select: { id: true, resultSource: true, _count: { select: { playerStats: true, teamStats: true } } },
  });

  console.log(`Found ${games.length} Game rows with a real resultSource and no statSource yet.\n`);
  if (games.length === 0) {
    console.log("Nothing to backfill.");
    await prisma.$disconnect();
    return;
  }

  for (const g of games) {
    const source = g.resultSource ?? "";
    if (!/fiba/i.test(source)) {
      console.log(`SKIP ${g.id}: resultSource "${source}" doesn't match a known provenance pattern — left NULL rather than guessed.`);
      continue;
    }
    console.log(`${APPLY ? "APPLY" : "DRY-RUN"} ${g.id}: statSource=FIBA_LIVESTATS_PDF_IMPORT (source="${source}", players=${g._count.playerStats}, teams=${g._count.teamStats})`);
    if (APPLY) {
      await prisma.$transaction([
        prisma.game.update({ where: { id: g.id }, data: { statSource: "FIBA_LIVESTATS_PDF_IMPORT" } }),
        prisma.playerStat.updateMany({ where: { gameId: g.id }, data: { statSource: "FIBA_LIVESTATS_PDF_IMPORT" } }),
        prisma.teamStat.updateMany({ where: { gameId: g.id }, data: { statSource: "FIBA_LIVESTATS_PDF_IMPORT" } }),
      ]);
    }
  }

  console.log(APPLY ? "\nBackfill applied." : "\nDry run only — re-run with --apply to write.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
