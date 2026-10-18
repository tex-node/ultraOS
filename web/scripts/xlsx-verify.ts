// Prompt 2 (streak v4) verification: prove an .xlsx produces the SAME batch as the CSV of the same game.
//
//   npx tsx scripts/xlsx-verify.ts                    # all 32 games, summary
//   npx tsx scripts/xlsx-verify.ts --write <dir>      # also write game 1's .csv and .xlsx
//   npx tsx scripts/xlsx-verify.ts --game 19 -v       # one game, verbose
//
// It goes through the REAL readers (parseBoxScoreCsv / parseBoxScoreXlsx) and compares the full
// IngestBoxScoreInput-shaped object (csvToCorrected), so a difference anywhere - a lost zero, a shifted
// column, a missing period - fails the comparison.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { batchGameToCsv, batchGameToXlsx, type BatchGame } from "../src/lib/scoresheet/batch-export";
import { csvToCorrected, parseBoxScoreCsv } from "../src/lib/scoresheet/csv-extract";
import { parseBoxScoreXlsx } from "../src/lib/scoresheet/excel-extract";

const argv = process.argv.slice(2);
const writeIndex = argv.indexOf("--write");
const outDir = writeIndex >= 0 ? argv[writeIndex + 1] : null;
const gameIndex = argv.indexOf("--game") >= 0 ? Number(argv[argv.indexOf("--game") + 1]) : null;
const verbose = argv.includes("-v");

function main() {
  if (outDir) mkdirSync(outDir, { recursive: true });
  const batch = JSON.parse(readFileSync("scripts/data/lbcl-2026-batch1.json", "utf8")) as { games: BatchGame[] };
  const indices = gameIndex === null ? batch.games.map((_, index) => index) : [gameIndex - 1];

  let compared = 0;
  let mismatches = 0;
  for (const index of indices) {
    const game = batch.games[index];
    if (!game) throw new Error(`game ${index + 1} not found`);

    const csvText = batchGameToCsv(game);
    const xlsxBytes = batchGameToXlsx(game);
    if (outDir && index === indices[0]) {
      writeFileSync(join(outDir, `lbcl-game-${String(index + 1).padStart(2, "0")}.csv`), csvText, "utf8");
      writeFileSync(join(outDir, `lbcl-game-${String(index + 1).padStart(2, "0")}.xlsx`), xlsxBytes);
    }

    const fromCsv = csvToCorrected(parseBoxScoreCsv(csvText));
    const { parsed: fromXlsxParsed, summary } = parseBoxScoreXlsx(xlsxBytes);
    const fromXlsx = csvToCorrected(fromXlsxParsed);
    compared += 1;

    const csvJson = JSON.stringify(fromCsv);
    const xlsxJson = JSON.stringify(fromXlsx);
    if (csvJson !== xlsxJson) {
      mismatches += 1;
      console.log(`game ${index + 1} (${game.sourceLabel}): MISMATCH`);
      // Report the first differing field rather than dumping two large objects.
      for (const key of ["homeScore", "awayScore", "periods"] as const) {
        if (JSON.stringify(fromCsv[key]) !== JSON.stringify(fromXlsx[key])) console.log(`  ${key}: csv=${JSON.stringify(fromCsv[key])} xlsx=${JSON.stringify(fromXlsx[key])}`);
      }
      for (const side of ["home", "away"] as const) {
        const a = fromCsv[side];
        const b = fromXlsx[side];
        if (a.clubName !== b.clubName) console.log(`  ${side}.clubName: csv="${a.clubName}" xlsx="${b.clubName}"`);
        if (a.players.length !== b.players.length) console.log(`  ${side}.players: csv=${a.players.length} xlsx=${b.players.length}`);
        a.players.forEach((player, position) => {
          const other = b.players[position];
          if (JSON.stringify(player) !== JSON.stringify(other)) console.log(`  ${side}.${position} ${player.name}: csv=${JSON.stringify(player)} xlsx=${JSON.stringify(other)}`);
        });
      }
    } else if (verbose || gameIndex !== null) {
      const players = fromCsv.home.players.length + fromCsv.away.players.length;
      const cells = summary.rowCount * summary.columnCount;
      console.log(`game ${index + 1}: identical (${players} players, ${summary.rowCount}x${summary.columnCount} = ${cells} cells, ${fromCsv.periods.length} periods)`);
    }
  }

  console.log("");
  console.log(`games compared        ${compared}`);
  console.log(`mismatches            ${mismatches}`);
  console.log(`result                ${mismatches === 0 ? "IDENTICAL batch from CSV and XLSX" : "DIFFERENCES FOUND"}`);
  if (mismatches > 0) process.exitCode = 1;
}

main();
