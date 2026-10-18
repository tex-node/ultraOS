import assert from "node:assert/strict";
import test from "node:test";
import type { OcrPage, OcrWord } from "@/lib/ocr/provider";
import { extractScoresheet, extractTeamTables } from "./extract";
import { buildChecksumReport } from "./checksums";
import { LBCL_LAYOUT } from "./templates";

// Extraction and checksum tests. A synthetic OcrPage is built from words with real coordinates -
// no OCR engine, no image, no database - which is the point: the geometry and the identities are
// what can be wrong, and both are testable as plain data.
//
// Coordinates mirror a printed LBCL-style sheet: a header row, then player rows, then a Totals row.

function w(text: string, x: number, y: number, confidence = 92): OcrWord {
  const width = Math.max(10, text.length * 9);
  return { text, confidence, x0: x, y0: y, x1: x + width, y1: y + 18, lineId: `1:1:${Math.round(y / 20)}` };
}

const HEADER: [string, number][] = [
  ["#", 40], ["Player", 100], ["MIN", 300], ["PTS", 360], ["FGM", 420], ["FGA", 470], ["REB", 540], ["AST", 600], ["PF", 660],
];

function header(y = 100): OcrWord[] {
  return HEADER.map(([text, x]) => w(text, x, y));
}

function playerRow(y: number, cells: { jersey: string; name: string; min: string; pts: string; fgm: string; fga: string; reb: string; ast: string; pf: string }): OcrWord[] {
  return [
    w(cells.jersey, 40, y),
    w(cells.name.split(" ")[0], 100, y),
    w(cells.name.split(" ").slice(1).join(" "), 170, y),
    w(cells.min, 300, y),
    w(cells.pts, 360, y),
    w(cells.fgm, 420, y),
    w(cells.fga, 470, y),
    w(cells.reb, 540, y),
    w(cells.ast, 600, y),
    w(cells.pf, 660, y),
  ];
}

function page(words: OcrWord[]): OcrPage {
  return { width: 800, height: 1000, words };
}

function standardSheet(): OcrPage {
  return page([
    ...header(),
    ...playerRow(140, { jersey: "7", name: "Alpha One", min: "28", pts: "14", fgm: "5", fga: "10", reb: "4", ast: "2", pf: "3" }),
    ...playerRow(170, { jersey: "11", name: "Beta Two", min: "22", pts: "9", fgm: "3", fga: "8", reb: "6", ast: "1", pf: "2" }),
    ...[w("Totals", 40, 210), w("50", 300, 210), w("23", 360, 210), w("8", 420, 210), w("18", 470, 210), w("10", 540, 210), w("3", 600, 210), w("5", 660, 210)],
  ]);
}

test("extractTeamTables finds the header, maps columns by anchor, and reads player rows", () => {
  const tables = extractTeamTables(standardSheet(), { layout: LBCL_LAYOUT });
  assert.equal(tables.length, 1);
  const table = tables[0];
  assert.equal(table.players.length, 2);

  const [alpha, beta] = table.players;
  assert.equal(alpha.jerseyNumber, 7);
  assert.equal(alpha.name, "Alpha One");
  assert.equal(alpha.minutesRaw, "28");
  assert.equal(alpha.cells.points?.value, 14);
  assert.equal(alpha.cells.fgm?.value, 5);
  assert.equal(alpha.cells.fga?.value, 10);
  assert.equal(alpha.cells.reb?.value, 4);
  assert.equal(alpha.cells.assists?.value, 2);
  assert.equal(alpha.cells.fouls?.value, 3);
  assert.equal(alpha.didNotPlay, false);
  assert.ok(alpha.confidence > 80, `clean row should be high confidence, got ${alpha.confidence}`);

  assert.equal(beta.jerseyNumber, 11);
  assert.equal(beta.name, "Beta Two");
  assert.equal(beta.cells.points?.value, 9);

  // The Totals row must not be mistaken for a player.
  assert.ok(!table.players.some((p) => p.name.toLowerCase().includes("totals")));
  assert.equal(table.totals.points?.value, 23);
  assert.equal(table.totals.reb?.value, 10);
});

test("a made-attempted pair in one column is split into made and attempted", () => {
  // "6-14" printed under a single FG column: the layout's pairKey fills FGA from it.
  const sheet = page([
    w("#", 40, 100), w("Player", 100, 100), w("MIN", 300, 100), w("PTS", 360, 100), w("FG", 420, 100),
    w("7", 40, 140), w("Alpha", 100, 140), w("One", 170, 140), w("28", 300, 140), w("14", 360, 140), w("6-14", 420, 140),
  ]);
  const [table] = extractTeamTables(sheet, { layout: LBCL_LAYOUT });
  assert.equal(table.players[0].cells.fgm?.value, 6);
  assert.equal(table.players[0].cells.fga?.value, 14);
});

test("a DNP row is flagged instead of being read as zero minutes", () => {
  const sheet = page([
    ...header(),
    w("4", 40, 140), w("Gamma", 100, 140), w("Three", 170, 140), w("DNP", 300, 140), w("0", 360, 140),
  ]);
  const [table] = extractTeamTables(sheet, { layout: LBCL_LAYOUT });
  assert.equal(table.players[0].didNotPlay, true);
  assert.equal(table.players[0].minutesRaw, "DNP");
});

test("a row whose points cell is not a number produces a warning, not a silent zero", () => {
  const sheet = page([
    ...header(),
    w("7", 40, 140), w("Alpha", 100, 140), w("One", 170, 140), w("28", 300, 140), w("I4", 360, 140),
  ]);
  const [table] = extractTeamTables(sheet, { layout: LBCL_LAYOUT });
  assert.equal(table.players[0].cells.points?.value, null);
  assert.ok(table.players[0].cells.points?.raw === "I4");
  assert.ok(table.warnings.some((warning) => /not a number/.test(warning)), table.warnings.join(" | "));
});

test("no header row means no table and an explicit warning (never a fabricated one)", () => {
  const sheet = page([w("something", 40, 100), w("else", 200, 100)]);
  const result = extractScoresheet([sheet], { layout: LBCL_LAYOUT, version: "test-1" });
  assert.equal(result.headerFound, false);
  assert.deepEqual(result.teams, []);
  assert.ok(result.warnings.some((warning) => /No table header/.test(warning)));
});

test("checksums: identities pass on a consistent table and fail on a broken one", () => {
  const [table] = extractTeamTables(standardSheet(), { layout: LBCL_LAYOUT });
  const good = buildChecksumReport({
    teams: [{ table, label: "Home" }],
    periods: [
      { homeScore: 12, awayScore: 8 },
      { homeScore: 11, awayScore: 9 },
    ],
    homeScore: 23,
    awayScore: 17,
  });
  assert.equal(good.ok, true, JSON.stringify(good.checks.filter((c) => !c.ok), null, 1));

  // Break one player's points: the team sum check must catch it even though the sheet's own totals
  // row no longer agrees with the player rows.
  const broken = structuredClone(table);
  broken.players[0].cells.points = { raw: "16", value: 16, confidence: 90 };
  const report = buildChecksumReport({ teams: [{ table: broken, label: "Home" }] });
  assert.equal(report.ok, false);
  const failing = report.checks.filter((c) => !c.ok).map((c) => c.key);
  assert.ok(failing.some((key) => key.startsWith("TEAM_SUM:Home:points")), failing.join(","));

  // A quarter sum that does not match the final score is caught too.
  const periodReport = buildChecksumReport({ teams: [{ table, label: "Home" }], periods: [{ homeScore: 10, awayScore: 9 }], homeScore: 23, awayScore: 17 });
  assert.equal(periodReport.ok, false);
  assert.ok(periodReport.checks.some((c) => c.key === "QUARTER_SUM:home" && !c.ok));
});

test("checksums: the per-player points identity catches a mis-keyed cell on a sheet that prints 2PM/3PM/FTM", () => {
  const cell = (value: number) => ({ raw: String(value), value, confidence: 95 });
  const base = { rowIndex: 1, jerseyNumber: 7, name: "Alpha One", minutesRaw: "28", didNotPlay: false, confidence: 95 } as const;
  const table = {
    teamLabel: null,
    headerRowIndex: 0,
    players: [
      { ...base, cells: { points: cell(14), fg2m: cell(4), fg3m: cell(2), ftm: cell(0), fgm: cell(6), fga: cell(12), fg2a: cell(8), fg3a: cell(4) } },
    ],
    totals: {},
    confidence: 95,
    warnings: [],
  };
  const pass = buildChecksumReport({ teams: [{ table, label: "Home" }] });
  assert.equal(pass.checks.find((c) => c.key.startsWith("PTS_IDENTITY"))?.ok, true, JSON.stringify(pass.checks, null, 1));

  // points changed but the shooting split did not: 2*4 + 3*2 + 0 = 14, not 16.
  const broken = structuredClone(table);
  broken.players[0].cells.points = cell(16);
  const fail = buildChecksumReport({ teams: [{ table: broken, label: "Home" }] });
  const failed = fail.checks.find((c) => c.key.startsWith("PTS_IDENTITY"));
  assert.equal(failed?.ok, false);
  assert.equal(failed?.expected, 14);
  assert.equal(failed?.actual, 16);
});
