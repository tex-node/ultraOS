import { readFileSync } from "node:fs";
import { batchGameToCsv, batchGameToXlsx, type BatchGame } from "../src/lib/scoresheet/batch-export";
import { csvToCorrected, parseBoxScoreCsv } from "../src/lib/scoresheet/csv-extract";
import { parseBoxScoreXlsx } from "../src/lib/scoresheet/excel-extract";
import { correctedTeamToTable } from "../src/lib/scoresheet/corrected";
import { buildChecksumReport } from "../src/lib/scoresheet/checksums";
import { withOrganizationContext } from "../src/lib/tenant-context";
import { createCsvScoresheetImport, approveScoresheetImport } from "../src/server/scoresheet/imports";

// Prompt 2 end-to-end: the .xlsx goes through the SAME review queue and approval path as a CSV, and the
// stored corrected JSON is identical to what the CSV of the same game produces.
const ORG = process.env.XLSX_ORG!;
const USER = process.env.XLSX_USER!;
const GAME = Number(process.env.XLSX_GAME ?? "19");

async function main() {
  const batch = JSON.parse(readFileSync("scripts/data/lbcl-2026-batch1.json", "utf8")) as { games: BatchGame[] };
  const game = batch.games[GAME - 1];
  if (!game) throw new Error(`game ${GAME} not found`);

  const xlsx = batchGameToXlsx(game);
  const csv = batchGameToCsv(game);
  const fromXlsx = parseBoxScoreXlsx(xlsx);
  const fromCsv = csvToCorrected(parseBoxScoreCsv(csv), { sourceLabel: game.sourceLabel });
  const corrected = csvToCorrected(fromXlsx.parsed, { sourceLabel: game.sourceLabel });

  console.log(`game ${GAME}: ${game.home.clubName} vs ${game.away.clubName} (${game.scheduledAt})`);
  console.log(`workbook: sheet "${fromXlsx.summary.sheetName}" of ${fromXlsx.summary.sheetCount}, ${fromXlsx.summary.rowCount}x${fromXlsx.summary.columnCount} cells`);
  console.log(`xlsx vs csv corrected JSON: ${JSON.stringify(corrected) === JSON.stringify(fromCsv) ? "IDENTICAL" : "DIFFERENT"}`);

  const checksums = buildChecksumReport({
    teams: [
      { table: correctedTeamToTable(corrected.home), label: corrected.home.clubName },
      { table: correctedTeamToTable(corrected.away), label: corrected.away.clubName },
    ],
    periods: corrected.periods,
    homeScore: corrected.homeScore,
    awayScore: corrected.awayScore,
  });
  console.log(`checksums: ${checksums.checks.length} checks, ${checksums.checks.filter((check) => !check.ok).length} failing`);

  const created = await withOrganizationContext(ORG, (tx) =>
    createCsvScoresheetImport(tx, {
      organizationId: ORG,
      userId: USER,
      sourceLabel: `${game.sourceLabel} (xlsx verification)`,
      parsed: fromXlsx.parsed,
      corrected,
      checksums,
      format: "XLSX",
      sourceInfo: { sourceFile: "lbcl-game-19.xlsx", workbook: fromXlsx.summary },
    }),
  );
  const approved = await withOrganizationContext(ORG, (tx) =>
    approveScoresheetImport(tx, {
      organizationId: ORG,
      importId: created.id,
      userId: USER,
      corrected: { ...corrected, approvedAt: new Date().toISOString(), approvedById: USER },
      checksums,
    }),
  );
  console.log(`import ${created.id}: approve ${JSON.stringify(approved)}`);
  console.log(`IMPORT_ID=${created.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
