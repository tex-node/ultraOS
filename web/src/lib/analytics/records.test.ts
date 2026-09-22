import assert from "node:assert/strict";
import test from "node:test";
import { buildGameRecords } from "./records";
import type { GameCore, TeamSideStats } from "./types";

function side(shortName: string, score: number): TeamSideStats {
  return {
    seasonClubId: shortName, shortName, name: shortName, logoUrl: null, primaryColor: null, score,
    rebounds: 0, assists: 0, turnovers: 0, fouls: 0,
    fieldGoalsMade: null, fieldGoalsAttempted: null, twoPointsMade: null, twoPointsAttempted: null,
    threePointsMade: null, threePointsAttempted: null, freeThrowsMade: null, freeThrowsAttempted: null,
    offensiveRebounds: null, defensiveRebounds: null, pointsFromTurnovers: null, pointsInPaint: null,
    pointsInPaintMade: null, pointsInPaintAttempted: null, secondChancePoints: null, fastBreakPoints: null,
    fastBreakPointsFromTurnovers: null, benchPoints: null, biggestLead: null, biggestScoringRun: null,
    pointsPerPossession: null, leadChanges: null, timesTied: null, timeWithLeadSeconds: null,
    fourPointsMade: null, fourPointsAttempted: null, ultraTimePointsFor: null, ultraTimePointsAgainst: null,
  };
}

function game(opts: { fixtureId: string; scheduledAt: string; homeShort: string; homeScore: number; awayShort: string; awayScore: number }): GameCore {
  return {
    gameId: opts.fixtureId, fixtureId: opts.fixtureId, status: "FINAL", dataCapability: "BOX_SCORE_ONLY",
    divisionName: "Open", scheduledAt: new Date(opts.scheduledAt),
    home: side(opts.homeShort, opts.homeScore), away: side(opts.awayShort, opts.awayScore),
    players: [], periods: [],
  };
}

// Regression: buildGameRecords used to pipe the whole games array through tieBreakEarliest
// AFTER sorting by combined score descending, which discards the score ordering entirely and
// always picks the chronologically earliest game in the season regardless of its score - caught
// while building the LBCL Highlights page (2026-09-22), where "Highest-Scoring Game" showed the
// season's very first game (79 combined) instead of the actual highest (133 combined).
test("buildGameRecords picks the actual highest-scoring game, not the earliest-scheduled one", () => {
  const games = [
    game({ fixtureId: "g1", scheduledAt: "2026-09-18", homeShort: "UTA", homeScore: 38, awayShort: "LBS", awayScore: 41 }), // 79, earliest
    game({ fixtureId: "g4", scheduledAt: "2026-09-19", homeShort: "SSH", homeScore: 65, awayShort: "CPS", awayScore: 68 }), // 133, actual highest
    game({ fixtureId: "g10", scheduledAt: "2026-09-20", homeShort: "LFK", homeScore: 94, awayShort: "SQT", awayScore: 16 }), // 110
  ];
  const records = buildGameRecords(games);
  const highest = records.find((r) => r.key === "Highest-Scoring Game");
  assert.equal(highest?.value, "133 pts");
  assert.equal(highest?.fixtureId, "g4");
});

test("buildGameRecords picks the actual lowest-scoring game", () => {
  const games = [
    game({ fixtureId: "g1", scheduledAt: "2026-09-18", homeShort: "UTA", homeScore: 38, awayShort: "LBS", awayScore: 41 }), // 79
    game({ fixtureId: "g4", scheduledAt: "2026-09-19", homeShort: "SSH", homeScore: 65, awayShort: "CPS", awayScore: 68 }), // 133
  ];
  const records = buildGameRecords(games);
  const lowest = records.find((r) => r.key === "Lowest-Scoring Game");
  assert.equal(lowest?.value, "79 pts");
  assert.equal(lowest?.fixtureId, "g1");
});

test("buildGameRecords breaks a highest-scoring tie chronologically", () => {
  const games = [
    game({ fixtureId: "later", scheduledAt: "2026-09-20", homeShort: "A", homeScore: 50, awayShort: "B", awayScore: 50 }),
    game({ fixtureId: "earlier", scheduledAt: "2026-09-18", homeShort: "C", homeScore: 40, awayShort: "D", awayScore: 60 }),
  ];
  const records = buildGameRecords(games);
  const highest = records.find((r) => r.key === "Highest-Scoring Game");
  assert.equal(highest?.fixtureId, "earlier");
});

test("buildGameRecords finds the closest and biggest-margin decided games", () => {
  const games = [
    game({ fixtureId: "close", scheduledAt: "2026-09-18", homeShort: "A", homeScore: 62, awayShort: "B", awayScore: 63 }),
    game({ fixtureId: "blowout", scheduledAt: "2026-09-20", homeShort: "C", homeScore: 94, awayShort: "D", awayScore: 16 }),
  ];
  const records = buildGameRecords(games);
  assert.equal(records.find((r) => r.key === "Closest Game")?.value, "1 pt margin");
  assert.equal(records.find((r) => r.key === "Biggest Margin")?.value, "78 pts");
});
