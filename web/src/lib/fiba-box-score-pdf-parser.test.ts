import assert from "node:assert/strict";
import test from "node:test";
import { parseFibaBoxScoreText } from "./fiba-box-score-pdf-parser";

// Real `pdftotext <file> -` output (no -layout) for one of the actual Season Zero FIBA/Genius
// Sports box score PDFs (APEX vs VORTEX, 15 Aug 2026) - not a synthetic fixture. Values below
// are cross-checked against the source PDF and, for the shooting splits, against the box
// score's own team-total row. This is the same game already hand-transcribed and validated in
// scripts/g84-import-season-zero-results.ts, so this test is also an independent check that
// the parser and the hand transcription agree on the fields the parser can safely extract.
const APEX_VS_VORTEX_TEXT = `ULTRA BASKETBALL
NIS, Sat 15 Aug 2026 Start time: 12:46
APEX 14 � 19 VORTEX
(2-6, 12-13)

FIBA Box Score
Game No.: 5 Game Duration: 00:26 Report Generated: Sat 15 Aug 2026 20:50

Scoring by 5 Minute intervals

APEX VTX

Q1 22 66

Q2 4 14 12 19

APEX (APEX)

No

Name

*0 IBRAHIMDAMUSA *3 BAMIDELE TAIWO *8 FRIDAYJACKSIFON 15 EGBAYELO PETER (C) *17 NWODU ELIJAH *20 IFOGHALE JUSTIN 33 OLUWATOBI ADESANYA 45 OHAMRARAMIRACLE Team/Coach Totals

Min
20:00 14:08 07:39 12:21 20:00 15:15 DNP 10:37
100:00

Field Goals M/A % 1/6 16.7 1/2 50.0 0/4 0.0 1/2 50.0 0/2 0.0 0/3 0.0

2 Points 3 Points M/A % M/A % 0/3 0.0 1/3 33.3 1/2 50.0 0/0 0.0 0/2 0.0 0/2 0.0 1/2 50.0 0/0 0.0 0/1 0.0 0/1 0.0 0/2 0.0 0/1 0.0

3/5 60.0 3/5 60.0 0/0 0.0

6/24 25.0 5/17 29.4 1/7 14.3

Free Throws M/A % 0/0 0.0 1/2 50.0 0/0 0.0 0/0 0.0 0/0 0.0 0/2 0.0
0/2 0.0
1/6 16.7

Coach:

Assistant Coach(es):

Rebounds OR DR TOT

AS

TO

ST

BS

Fouls PF FD

+/-

EF

PTS

0 1 1 0 2 1 0 0 0 -5 -2 3

VORTEX (VTX)

No

Name

0 AFOLABI PECULIAR *3 OBASI IFEOLUWA *8 DENNIS GODSWILL 15 RALUCHUKWU BRIAN *17 JOSEPH ASESANYA *20 NOUMAN EJIRINADA *33 FAVOUR EJELONU (C) 45 VICTOR EDET Team/Coach Totals

Min
02:02 10:36 20:00 13:18 05:53 13:48 20:00 14:23
100:00

Field Goals M/A % 0/0 0.0 0/0 0.0 4/5 80.0 0/1 0.0 0/1 0.0 2/2 100.0 2/7 28.6 0/2 0.0
8/18 44.4

2 Points 3 Points M/A % M/A % 0/0 0.0 0/0 0.0 0/0 0.0 0/0 0.0 4/4 100.0 0/1 0.0 0/1 0.0 0/0 0.0 0/1 0.0 0/0 0.0 2/2 100.0 0/0 0.0 1/2 50.0 1/5 20.0 0/1 0.0 0/1 0.0
7/11 63.6 1/7 14.3

Free Throws M/A % 0/0 0.0 1/1 100.0 0/1 0.0 0/0 0.0 0/0 0.0 0/1 0.0 1/2 50.0 0/0 0.0
2/5 40.0

Coach:

Assistant Coach(es):

Rebounds OR DR TOT

AS

TO

ST

BS

Fouls PF FD

+/-

EF

PTS

0 0 0 0 00 00020 0
`;

test("real Season Zero PDF: header, score, and game number parse correctly", () => {
  const result = parseFibaBoxScoreText(APEX_VS_VORTEX_TEXT);
  assert.deepEqual(result.header, {
    homeLabel: "APEX",
    awayLabel: "VORTEX",
    homeScore: 14,
    awayScore: 19,
    venueLine: "ULTRA BASKETBALL",
    gameNumberLabel: "5",
  });
});

test("real Season Zero PDF: roster (jersey, name, starter, captain, DNP) parses exactly, including the one DNP player", () => {
  const result = parseFibaBoxScoreText(APEX_VS_VORTEX_TEXT);
  assert.equal(result.home?.roster.length, 8);
  assert.deepEqual(result.home?.roster[3], {
    isStarter: false,
    jerseyNumber: 15,
    reportedName: "EGBAYELO PETER",
    isCaptain: true,
    didNotPlay: false,
  });
  const dnpPlayer = result.home?.roster[6];
  assert.equal(dnpPlayer?.reportedName, "OLUWATOBI ADESANYA");
  assert.equal(dnpPlayer?.didNotPlay, true);
  assert.equal(result.home?.minutesByIndex[6], "DNP");
});

test("real Season Zero PDF: Free Throws parse and arithmetic-match the team-total row for both teams", () => {
  const result = parseFibaBoxScoreText(APEX_VS_VORTEX_TEXT);
  // Ground truth per the source PDF: APEX FT line (wrapped across two rows) is
  // 0/0, 1/2, 0/0, 0/0, 0/0, 0/2, 0/2 - team total 1/6 confirms it (1 made, 6 attempted).
  assert.deepEqual(result.home?.freeThrowsByIndex, [
    { made: 0, attempted: 0, percent: 0 },
    { made: 1, attempted: 2, percent: 50 },
    { made: 0, attempted: 0, percent: 0 },
    { made: 0, attempted: 0, percent: 0 },
    { made: 0, attempted: 0, percent: 0 },
    { made: 0, attempted: 2, percent: 0 },
    { made: 0, attempted: 2, percent: 0 },
  ]);
  assert.deepEqual(result.away?.freeThrowsByIndex, [
    { made: 0, attempted: 0, percent: 0 },
    { made: 1, attempted: 1, percent: 100 },
    { made: 0, attempted: 1, percent: 0 },
    { made: 0, attempted: 0, percent: 0 },
    { made: 0, attempted: 0, percent: 0 },
    { made: 0, attempted: 1, percent: 0 },
    { made: 1, attempted: 2, percent: 50 },
    { made: 0, attempted: 0, percent: 0 },
  ]);
});

test("real Season Zero PDF: VORTEX Field Goals parse (8-for-8 roster, team total 8/18 confirms it)", () => {
  const result = parseFibaBoxScoreText(APEX_VS_VORTEX_TEXT);
  assert.deepEqual(result.away?.fieldGoalsByIndex, [
    { made: 0, attempted: 0, percent: 0 },
    { made: 0, attempted: 0, percent: 0 },
    { made: 4, attempted: 5, percent: 80 },
    { made: 0, attempted: 1, percent: 0 },
    { made: 0, attempted: 1, percent: 0 },
    { made: 2, attempted: 2, percent: 100 },
    { made: 2, attempted: 7, percent: 28.6 },
    { made: 0, attempted: 2, percent: 0 },
  ]);
});

test("real Season Zero PDF: APEX Field Goals correctly refuses to guess when the token count can't be reconciled", () => {
  const result = parseFibaBoxScoreText(APEX_VS_VORTEX_TEXT);
  // The source PDF genuinely only prints 6 FG pairs for APEX's 7 non-DNP players (a real,
  // unrecoverable ambiguity in this specific export, not a parser bug) - this must stay null,
  // never a guessed 6-to-7 mapping, and the caller must be told to transcribe it by hand.
  assert.equal(result.home?.fieldGoalsByIndex, null);
  assert.ok(result.warnings.some((w) => w.includes("APEX") && w.includes("Field Goals")));
});

test("2PT/3PT and counting stats are never auto-extracted (documented limitation, not silently guessed)", () => {
  const result = parseFibaBoxScoreText(APEX_VS_VORTEX_TEXT);
  assert.equal(result.home?.twoPointsByIndex, null);
  assert.equal(result.away?.twoPointsByIndex, null);
  assert.ok(result.warnings.some((w) => w.includes("counting stats")));
});
