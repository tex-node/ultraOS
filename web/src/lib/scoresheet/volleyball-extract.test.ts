import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVolleyballCsv, resolveVolleyballHeader } from "./volleyball-extract";

// A volleyball sheet is NOT a basketball sheet: kills/errors/aces/blocks/digs, no made-attempted pairs, and
// the printed abbreviations differ from exports. These tests pin the aliases and the two failure modes that
// matter - a value silently dropped and a row attributed to the wrong side.

const SHEET = `## Surge
#,Player,K,E,SA,BLK,DIG,AST,PTS
4,Ada Nwosu,12,3,2,1,7,0,15
7,Bode Ade,8,5,0,2,4,1,10
## Vortex
No.,Name,Kill,Attack Error,Aces,Blocks,Digs,Assists,Points
2,Chi Obi,9,4,1,0,6,0,10
`;

test("both teams parse, with metric keys from the sport definition", () => {
  const parsed = parseVolleyballCsv(SHEET);
  assert.equal(parsed.teams.length, 2);
  const [surge, vortex] = parsed.teams;
  assert.equal(surge.clubName, "Surge");
  assert.equal(vortex.clubName, "Vortex");
  assert.equal(surge.players.length, 2);
  assert.deepEqual(surge.players[0].metrics, { kills: 12, errors: 3, aces: 2, blocks: 1, digs: 7, assists: 0, points: 15 });
  assert.equal(surge.players[0].jersey, "4");
  // The second sheet uses the long names and "No."/"Kill" - same metric keys.
  assert.equal(vortex.players[0].name, "Chi Obi");
  assert.equal(vortex.players[0].metrics.kills, 9);
  assert.equal(vortex.players[0].metrics.errors, 4);
  assert.equal(vortex.players[0].metrics.aces, 1);
  assert.deepEqual(parsed.warnings, []);
});

test("the printed abbreviations are recognised", () => {
  for (const [header, metric] of [
    ["K", "kills"],
    ["E", "errors"],
    ["SA", "aces"],
    ["BLK", "blocks"],
    ["DIG", "digs"],
    ["AST", "assists"],
    ["SR", "serveReceives"],
    ["BA", "blockAssists"],
  ] as const) {
    assert.deepEqual(resolveVolleyballHeader(header), { metric, known: true }, header);
  }
});

test("an unknown column is reported, not silently dropped", () => {
  const sheet = `## Surge\n#,Player,K,Widgets\n4,Ada,12,9\n`;
  const parsed = parseVolleyballCsv(sheet);
  assert.equal(parsed.teams[0].players[0].metrics.kills, 12);
  assert.equal(parsed.teams[0].players[0].metrics.widgets, undefined);
  assert.ok(parsed.headerMap.some((entry) => entry.header === "Widgets" && entry.metric === null));
});

test("a non-numeric value is a per-player warning, not a silent zero", () => {
  const sheet = `## Surge\n#,Player,K,BLK\n4,Ada,twelve,3\n`;
  const parsed = parseVolleyballCsv(sheet);
  const player = parsed.teams[0].players[0];
  assert.equal(player.metrics.blocks, 3);
  assert.equal(player.metrics.kills, undefined);
  assert.match(player.warnings[0], /non-numeric value "twelve" for Ada/);
});

test("a row before any team section is ignored with a warning, never guessed", () => {
  const parsed = parseVolleyballCsv("9,Nobody,5,1\n## Surge\n#,Player,K\n4,Ada,12\n");
  assert.equal(parsed.teams.length, 1);
  assert.equal(parsed.teams[0].players.length, 1);
  assert.match(parsed.warnings[0], /before any '## TEAM' section/);
});

test("a header with no metric column is called out", () => {
  const parsed = parseVolleyballCsv("## Surge\n#,Player,Notes\n4,Ada,good\n");
  assert.ok(parsed.headerMap.length > 0);
  assert.ok(parsed.warnings.some((warning) => /no recognised volleyball metric column/.test(warning)));
});

test("a percent column is ignored rather than added to the counts", () => {
  const parsed = parseVolleyballCsv("## Surge\n#,Player,K,K%\n4,Ada,12,60\n");
  assert.deepEqual(parsed.teams[0].players[0].metrics, { kills: 12 });
});
