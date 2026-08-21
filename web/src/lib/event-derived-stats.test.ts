import assert from "node:assert/strict";
import test from "node:test";
import { derivePlayerStats, deriveTeamStats, deriveTeamScore, type DerivableEvent } from "./event-derived-stats";

const HOME = "home-club";
const AWAY = "away-club";
const P1 = "player-1";
const P2 = "player-2";

function shot(overrides: Partial<DerivableEvent>): DerivableEvent {
  return {
    eventType: "SHOT_MADE", status: "ACTIVE", seasonClubId: HOME, playerId: P1,
    points: 0, basePointValue: null, isUltraTime: false,
    ...overrides,
  };
}

test("2PT make: 2PM +1, FGM +1, FGA +1, PTS +2", () => {
  const stats = derivePlayerStats([shot({ eventType: "SHOT_MADE", basePointValue: 2, points: 2 })]);
  const p = stats.get(P1)!;
  assert.equal(p.twoPointsMade, 1);
  assert.equal(p.fieldGoalsMade, 1);
  assert.equal(p.fieldGoalsAttempted, 1);
  assert.equal(p.points, 2);
});

test("2PT miss: 2PA +1 only, no makes, no points", () => {
  const stats = derivePlayerStats([shot({ eventType: "SHOT_MISSED", basePointValue: 2, points: 0 })]);
  const p = stats.get(P1)!;
  assert.equal(p.twoPointsAttempted, 1);
  assert.equal(p.twoPointsMade, 0);
  assert.equal(p.fieldGoalsAttempted, 1);
  assert.equal(p.fieldGoalsMade, 0);
  assert.equal(p.points, 0);
});

test("3PT make: 3PM +1, FGM +1, PTS +3", () => {
  const p = derivePlayerStats([shot({ eventType: "SHOT_MADE", basePointValue: 3, points: 3 })]).get(P1)!;
  assert.equal(p.threePointsMade, 1);
  assert.equal(p.fieldGoalsMade, 1);
  assert.equal(p.points, 3);
});

test("4PT make: 4PM +1, FGM +1 (4PT counts as a field goal), PTS +4", () => {
  const p = derivePlayerStats([shot({ eventType: "SHOT_MADE", basePointValue: 4, points: 4 })]).get(P1)!;
  assert.equal(p.fourPointsMade, 1);
  assert.equal(p.fieldGoalsMade, 1);
  assert.equal(p.points, 4);
});

test("4PT miss: 4PA +1 and FGA +1 only", () => {
  const p = derivePlayerStats([shot({ eventType: "SHOT_MISSED", basePointValue: 4, points: 0 })]).get(P1)!;
  assert.equal(p.fourPointsAttempted, 1);
  assert.equal(p.fourPointsMade, 0);
  assert.equal(p.fieldGoalsAttempted, 1);
  assert.equal(p.fieldGoalsMade, 0);
});

test("FT make: FTM +1, does not touch FGM/FGA (a free throw is never a field goal)", () => {
  const p = derivePlayerStats([shot({ eventType: "FREE_THROW_MADE", basePointValue: 1, points: 1 })]).get(P1)!;
  assert.equal(p.freeThrowsMade, 1);
  assert.equal(p.fieldGoalsMade, 0);
  assert.equal(p.fieldGoalsAttempted, 0);
  assert.equal(p.points, 1);
});

test("FT miss: FTA +1 only", () => {
  const p = derivePlayerStats([shot({ eventType: "FREE_THROW_MISSED", basePointValue: 1, points: 0 })]).get(P1)!;
  assert.equal(p.freeThrowsAttempted, 1);
  assert.equal(p.freeThrowsMade, 0);
});

test("4PT made during Ultra Time: PTS +8 but 4PM only +1 (effective points, not base x count)", () => {
  const p = derivePlayerStats([shot({ eventType: "SHOT_MADE", basePointValue: 4, points: 8, isUltraTime: true })]).get(P1)!;
  assert.equal(p.fourPointsMade, 1);
  assert.equal(p.fourPointsAttempted, 1);
  assert.equal(p.fieldGoalsMade, 1);
  assert.equal(p.points, 8);
  assert.equal(p.ultraTimePoints, 8);
  assert.equal(p.ultraTimeFieldGoalsMade, 1);
});

test("3PT made during Ultra Time: PTS +6 but 3PM only +1", () => {
  const p = derivePlayerStats([shot({ eventType: "SHOT_MADE", basePointValue: 3, points: 6, isUltraTime: true })]).get(P1)!;
  assert.equal(p.threePointsMade, 1);
  assert.equal(p.points, 6);
  assert.equal(p.ultraTimePoints, 6);
});

test("OREB increments offensiveRebounds and total rebounds", () => {
  const p = derivePlayerStats([shot({ eventType: "OFFENSIVE_REBOUND" })]).get(P1)!;
  assert.equal(p.offensiveRebounds, 1);
  assert.equal(p.rebounds, 1);
  assert.equal(p.defensiveRebounds, 0);
});

test("DREB increments defensiveRebounds and total rebounds", () => {
  const p = derivePlayerStats([shot({ eventType: "DEFENSIVE_REBOUND" })]).get(P1)!;
  assert.equal(p.defensiveRebounds, 1);
  assert.equal(p.rebounds, 1);
});

test("AST/STL/BLK/TOV/PF each increment their own counter only", () => {
  const events: DerivableEvent[] = ["ASSIST", "STEAL", "BLOCK", "TURNOVER", "FOUL"].map((eventType) => shot({ eventType }));
  const p = derivePlayerStats(events).get(P1)!;
  assert.equal(p.assists, 1);
  assert.equal(p.steals, 1);
  assert.equal(p.blocks, 1);
  assert.equal(p.turnovers, 1);
  assert.equal(p.fouls, 1);
});

test("VOIDED events are excluded from the derivation entirely", () => {
  const stats = derivePlayerStats([shot({ eventType: "SHOT_MADE", basePointValue: 3, points: 3, status: "VOIDED" })]);
  assert.equal(stats.has(P1), false);
});

test("a corrected shot (original CORRECTED, superseding event ACTIVE) produces the corrected aggregate only", () => {
  const events: DerivableEvent[] = [
    shot({ eventType: "SHOT_MADE", basePointValue: 2, points: 2, status: "CORRECTED" }),
    shot({ eventType: "SHOT_MADE", basePointValue: 3, points: 3, status: "ACTIVE" }),
  ];
  const p = derivePlayerStats(events).get(P1)!;
  assert.equal(p.twoPointsMade, 0, "the corrected-away 2PT must not count");
  assert.equal(p.threePointsMade, 1);
  assert.equal(p.points, 3);
});

test("team totals equal the sum of that team's player totals", () => {
  const events: DerivableEvent[] = [
    shot({ playerId: P1, seasonClubId: HOME, eventType: "SHOT_MADE", basePointValue: 2, points: 2 }),
    shot({ playerId: P2, seasonClubId: HOME, eventType: "SHOT_MADE", basePointValue: 3, points: 3 }),
    shot({ playerId: "away-1", seasonClubId: AWAY, eventType: "SHOT_MADE", basePointValue: 4, points: 4 }),
  ];
  const players = derivePlayerStats(events);
  const teams = deriveTeamStats(players);
  const home = teams.get(HOME)!;
  const away = teams.get(AWAY)!;
  assert.equal(home.points, 5);
  assert.equal(home.fieldGoalsMade, 2);
  assert.equal(away.points, 4);
  assert.equal(deriveTeamScore(teams, HOME), 5);
  assert.equal(deriveTeamScore(teams, "nonexistent-club"), 0);
});

test("official score and derived statistical score are independent values, not the same variable", () => {
  const events: DerivableEvent[] = [shot({ eventType: "SHOT_MADE", basePointValue: 2, points: 2 })];
  const officialScore = 30; // e.g. the scorer's Fixture.homeScore, entirely unrelated to this event list
  const teams = deriveTeamStats(derivePlayerStats(events));
  const statisticalScore = deriveTeamScore(teams, HOME);
  assert.notEqual(officialScore, statisticalScore);
  assert.equal(statisticalScore, 2);
});

test("events with no playerId or seasonClubId (should not occur for statistician events, but must not crash or attribute) are ignored", () => {
  const stats = derivePlayerStats([shot({ playerId: null }), shot({ seasonClubId: null })]);
  assert.equal(stats.size, 0);
});
