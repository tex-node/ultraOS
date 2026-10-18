import { test } from "node:test";
import assert from "node:assert/strict";
import { csvToCorrected, parseBoxScoreCsv, parseCsvRows, resolveCsvHeader } from "./csv-extract";

// The CSV path exists because the OCR path could not read the LBCL screenshots. These tests pin the
// behaviours that make it trustworthy: quoted fields, generated headers, made-attempted pairs, two
// teams named either by a section header or a column, and the refusal to silently invent numbers.

const SAMPLE = `# league: Lagos Basketball Community League
# season: 2026 Season
# date: 2026-09-20T16:46:00.000Z
# homeScore: 94
# awayScore: 16
# period: Q1,19,2
# period: Q2,15,9
## LEO KAREEM FOUNDATION
No,Player,Min,PTS,FG,2P,3P,FT,OR,DR,REB,AST,TO,STL,BLK,PF
4,MUSA ALFA,13:51,0,0-0,0-0,0-0,0-0,0,0,0,1,0,1,0,0
5,JOCHEN NWORIE,29:17,5,5-8,4-4,1-4,1-1,0,2,2,1,4,1,0,1
## SQUARE TEAM
2,BRAHIM MODIR,11:41,5,1-2,0-0,1-2,2-2,0,0,0,0,1,0,0,0
7,PETER OKEKE,15:32,27,2-3,0-0,2-3,1-1,2,1,3,2,0,0,0,2
`;

test("a quoted field keeps its comma and its quotes", () => {
  const rows = parseCsvRows('a,"b,c","d""e"\n1,2,3\n');
  assert.deepEqual(rows[0], ["a", "b,c", 'd"e']);
  assert.deepEqual(rows[1], ["1", "2", "3"]);
});

test("generated-export headers resolve, and percentage columns are ignored explicitly", () => {
  assert.equal(resolveCsvHeader("PTS")?.column, "points");
  assert.equal(resolveCsvHeader("2P")?.column, "fg2m");
  assert.equal(resolveCsvHeader("2P")?.combined, true);
  assert.equal(resolveCsvHeader("FG%")?.column, null);
  assert.equal(resolveCsvHeader("PLAYER")?.column, "name");
  assert.equal(resolveCsvHeader("TEAM")?.column, "team");
  assert.equal(resolveCsvHeader("something-else"), null);
});

test("section headers name the teams and the metadata lines populate the game", () => {
  const parsed = parseBoxScoreCsv(SAMPLE);
  assert.equal(parsed.teams.length, 2);
  assert.equal(parsed.teams[0].clubName, "LEO KAREEM FOUNDATION");
  assert.equal(parsed.teams[1].clubName, "SQUARE TEAM");
  assert.equal(parsed.teams[0].players.length, 2);
  assert.equal(parsed.meta.homeScore, 94);
  assert.deepEqual(parsed.meta.periods[0], { label: "Q1", homeScore: 19, awayScore: 2 });
});

test("a made-attempted pair fills both the made and the attempts column", () => {
  const parsed = parseBoxScoreCsv(SAMPLE);
  const jochen = parsed.teams[0].players[1];
  assert.equal(jochen.name, "JOCHEN NWORIE");
  assert.equal(jochen.points, 5);
  assert.equal(jochen.fgm, 5);
  assert.equal(jochen.fga, 8);
  assert.equal(jochen.fg3m, 1);
  assert.equal(jochen.fg3a, 4);
  assert.equal(jochen.ftm, 1);
  assert.equal(jochen.fta, 1);
  assert.equal(jochen.minutesPlayed, 29);
  assert.equal(jochen.reb, 2);
});

test("a single made value with no attempts column is kept, and derived attempts are not invented", () => {
  const parsed = parseBoxScoreCsv(`## HOME\nPlayer,Min,PTS,2P,3P,FT\nA Player,10,6,2,0,2\n## AWAY\nPlayer,Min,PTS,2P,3P,FT\nB Player,10,4,1,0,2\n`);
  const player = parsed.teams[0].players[0];
  assert.equal(player.fg2m, 2);
  assert.equal(player.fg2a, 0);
  assert.equal(player.points, 6);
});

test("a team column names the sides when there are no section headers", () => {
  const parsed = parseBoxScoreCsv(`team,Player,Min,PTS\nHome Club,A One,10,4\nAway Club,B Two,12,6\nHome Club,C Three,5,2\n`);
  assert.equal(parsed.teams.length, 2);
  assert.equal(parsed.teams[0].clubName, "Home Club");
  assert.equal(parsed.teams[0].players.length, 2);
});

test("a totals row is skipped rather than ingested as a player", () => {
  const parsed = parseBoxScoreCsv(`## HOME\nPlayer,Min,PTS\nA One,10,4\nTotals,200,4\n## AWAY\nPlayer,Min,PTS\nB Two,10,6\n`);
  assert.equal(parsed.teams[0].players.length, 1);
  assert.equal(parsed.teams[0].players[0].name, "A One");
});

test("DNP is a did-not-play row, not a zero-minute player who played", () => {
  const parsed = parseBoxScoreCsv(`## HOME\nPlayer,Min,PTS\nA One,DNP,0\n## AWAY\nPlayer,Min,PTS\nB Two,10,0\n`);
  assert.equal(parsed.teams[0].players[0].didNotPlay, true);
});

test("a CSV with no player-name column is refused, with a reason", () => {
  assert.throws(() => parseBoxScoreCsv(`## HOME\nMin,PTS\n10,4\n`), /no player-name column/i);
});

test("one team is refused by csvToCorrected rather than guessed at", () => {
  const parsed = parseBoxScoreCsv(`## HOME\nPlayer,Min,PTS\nA One,10,4\n`);
  assert.throws(() => csvToCorrected(parsed), /two teams/i);
});

test("csvToCorrected produces the shape the review queue and ingest CLI already use", () => {
  const corrected = csvToCorrected(parseBoxScoreCsv(SAMPLE));
  assert.equal(corrected.version, "csv-1");
  assert.equal(corrected.home.clubName, "LEO KAREEM FOUNDATION");
  assert.equal(corrected.homeScore, 94);
  assert.equal(corrected.home.totals.points, 5);
  assert.equal(corrected.away.players.length, 2);
  assert.equal(corrected.periods.length, 2);
});
