import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { looksLikeXlsx, parseBoxScoreXlsx, xlsxToMatrix } from "./excel-extract";
import { csvToCorrected, parseBoxScoreCsv } from "./csv-extract";

// A workbook must produce EXACTLY the same ParsedCsvScoresheet as the CSV of the same game. That is the
// whole point of routing both through parseBoxScoreMatrix, so it is the first test.

const CSV = `# league: Lagos Basketball Community League
# season: 2026 Season
# date: 2026-09-20T16:46:00.000Z
# homeScore: 94
# awayScore: 16
# period: Q1,19,2
## LEO KAREEM FOUNDATION
No,Player,Min,PTS,FG,2P,3P,FT,OR,DR,REB,AST,TO,STL,BLK,PF
4,MUSA ALFA,13:51,0,0-0,0-0,0-0,0-0,0,0,0,1,0,1,0,0
5,JOCHEN NWORIE,29:17,5,5-8,4-4,1-4,1-1,0,2,2,1,4,1,0,1
## SQUARE TEAM
2,BRAHIM MODIR,11:41,5,1-2,0-0,1-2,2-2,0,0,0,0,1,0,0,0
7,PETER OKEKE,15:32,27,2-3,0-0,2-3,1-1,2,1,3,2,0,0,0,2
`;

function workbookFromCsv(csv: string): Uint8Array {
  const rows = csv.trimEnd().split("\n").map((line) => line.split(","));
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Box Score");
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

test("a workbook produces the SAME parsed sheet as the CSV of the same game", () => {
  const fromCsv = parseBoxScoreCsv(CSV);
  const { parsed } = parseBoxScoreXlsx(workbookFromCsv(CSV));
  assert.deepEqual(parsed.teams.map((team) => team.clubName), fromCsv.teams.map((team) => team.clubName));
  assert.deepEqual(parsed.teams.map((team) => team.players.map((player) => player.name)), fromCsv.teams.map((team) => team.players.map((player) => player.name)));
  assert.deepEqual(parsed.teams.map((team) => team.players.map((player) => player.points)), fromCsv.teams.map((team) => team.players.map((player) => player.points)));
  assert.equal(parsed.meta.homeScore, fromCsv.meta.homeScore);
  assert.deepEqual(parsed.meta.periods, fromCsv.meta.periods);
  // The full IngestBoxScoreInput-shaped object must be identical too, not just the headline fields.
  assert.deepEqual(JSON.parse(JSON.stringify(csvToCorrected(parsed))), JSON.parse(JSON.stringify(csvToCorrected(fromCsv))));
});

test("numeric cells become strings, and a zero cell survives as '0'", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["## HOME"],
    ["Player", "Min", "PTS"],
    ["A Player", 10, 0],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "S1");
  const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const { matrix } = xlsxToMatrix(bytes);
  assert.deepEqual(matrix[2], ["A Player", "10", "0"]);
});

test("ragged rows are padded so trailing cells keep their column", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["## HOME", "", ""],
    ["Player", "Min", "PTS"],
    ["A Player", 10], // no PTS cell at all
    ["B Player", 12, 4],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "S1");
  const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const { matrix, summary } = xlsxToMatrix(bytes);
  assert.equal(summary.columnCount, 3);
  assert.deepEqual(matrix[2], ["A Player", "10", ""]);
});

test("a file that is not a workbook is refused with a reason", () => {
  assert.throws(() => parseBoxScoreXlsx(new TextEncoder().encode("not a workbook, just text")), /not an \.xlsx/);
});

test("looksLikeXlsx recognises the zip signature and rejects plain text", () => {
  const bytes = workbookFromCsv(CSV);
  assert.equal(looksLikeXlsx(bytes), true);
  assert.equal(looksLikeXlsx(new TextEncoder().encode("id,name,pts\n1,a,2\n")), false);
});

test("an empty first sheet is refused rather than yielding an empty scoresheet", () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[]]), "Empty");
  const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  assert.throws(() => parseBoxScoreXlsx(bytes), /empty/i);
});
