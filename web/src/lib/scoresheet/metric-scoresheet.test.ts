import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSheet, check, VOL_BALL_ROWS, VOLLEYBALL_DEFINITION } from "./metric-scoresheet.fixture";

test("columns come from the sport definition, not a hardcoded list", () => {
  const keys = VOL_BALL_ROWS.map((column) => column.key);
  assert.ok(keys.includes("kills"));
  assert.ok(keys.includes("aces"));
  assert.ok(keys.includes("blocks"));
  // Basketball's columns must NOT appear for volleyball.
  assert.ok(!keys.includes("fgm"));
  assert.ok(!keys.includes("reb"));
});

test("a correct sheet passes every check", () => {
  const report = check(buildSheet());
  assert.equal(report.ok, true);
  assert.ok(report.checks.length >= 5);
});

test("a PTS column that does not add up is reported, with the numbers", () => {
  const sheet = buildSheet();
  sheet.teams[0].players[0].metrics.points = 99; // 12 kills + 2 aces + 1 block = 15
  const report = check(sheet);
  assert.equal(report.ok, false);
  const failed = report.checks.find((entry) => !entry.ok);
  assert.ok(failed);
  assert.match(failed!.detail, /PTS 99 vs kills\+aces\+blocks 15/);
});

test("a team with no players fails rather than passing silently", () => {
  const sheet = buildSheet();
  sheet.teams[0].players = [];
  const report = check(sheet);
  assert.equal(report.ok, false);
  assert.ok(report.checks.some((entry) => entry.id === "PLAYERS:Surge" && !entry.ok));
});

test("duplicate names inside a team are caught (they would double-post to the same player)", () => {
  const sheet = buildSheet();
  sheet.teams[1].players.push({ ...sheet.teams[1].players[0] });
  const report = check(sheet);
  assert.equal(report.ok, false);
  assert.match(report.checks.find((entry) => entry.id === "DUPLICATES:Vortex")!.detail, /chi obi/);
});

test("totals are per team per column, which is what an operator compares with the sheet", () => {
  const report = check(buildSheet());
  const surge = report.totals.find((total) => total.team === "Surge")!;
  // Ada 12 + Bode 8 kills
  assert.equal(surge.columns.kills, 20);
  assert.equal(surge.columns.aces, 2);
  assert.equal(surge.columns.blocks, 3);
});

test("a missing points column is not checked - absent is different from wrong", () => {
  const sheet = buildSheet();
  for (const team of sheet.teams) for (const player of team.players) delete player.metrics.points;
  const report = check(sheet);
  assert.equal(report.ok, true);
  assert.ok(!report.checks.some((entry) => entry.id.startsWith("POINTS:")));
});

test("the definition is exposed so the form can render the same columns", () => {
  assert.equal(VOLLEYBALL_DEFINITION.slug, "volleyball");
});
