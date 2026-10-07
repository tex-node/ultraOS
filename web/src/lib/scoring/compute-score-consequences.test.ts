// Baseline test for the pure extraction of recordScoreInternal's (src/app/games/actions-internal.ts)
// inline score/delta math. Every expected value here was read directly from that function's current
// body (not re-derived from computeScoreConsequences itself) - this is the pre-extraction characterization
// that Step 4 (refactoring recordScoreInternal to call this function) will be verified against,
// alongside the DB-level invocation test (actions-internal.test.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { computeScoreConsequences, type ComputeScoreConsequencesInput } from "./compute-score-consequences";

const HOME = "home-season-club";
const AWAY = "away-season-club";
const PLAYER = { id: "player-1" };

// Legacy defaults (rules: null -> LEGACY_RULE_SNAPSHOT): periodCount 2, ultraTimeStartRemainingSeconds
// 60, ultraTimeMultiplier 2, ultraTimeAppliesFinalPeriodOnly true, fourPointEnabled true.
function baseInput(overrides: Partial<ComputeScoreConsequencesInput> = {}): ComputeScoreConsequencesInput {
  return {
    shotValue: 2,
    rules: null,
    gameStatus: "LIVE",
    currentPeriod: 1,
    remainingClockSeconds: 600,
    seasonClubId: HOME,
    opposingSeasonClubId: AWAY,
    isHome: true,
    homeScore: 0,
    awayScore: 0,
    player: PLAYER,
    ...overrides,
  };
}

test("computeScoreConsequences: a made 2PT shot (non-Ultra Time) - fixture/event/player/team deltas match recordScore's current inline math", () => {
  const result = computeScoreConsequences(baseInput({ shotValue: 2 }));
  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.deepEqual(result.fixtureDelta, { isHome: true, previousScore: 0, nextScore: 2, actualPoints: 2 });
  assert.equal(result.eventFields.points, 2);
  assert.equal(result.eventFields.basePointValue, 2);
  assert.equal(result.eventFields.multiplier, 1);
  assert.equal(result.eventFields.isUltraTime, false);
  assert.equal(result.eventFields.made, true);
  assert.equal(result.eventFields.isFourPointAttempt, false);
  assert.equal(result.eventFields.description, "+2 points");
  assert.deepEqual(
    { before: result.eventFields.homeScoreBefore, after: result.eventFields.homeScoreAfter, awayBefore: result.eventFields.awayScoreBefore, awayAfter: result.eventFields.awayScoreAfter },
    { before: 0, after: 2, awayBefore: 0, awayAfter: 0 },
  );

  assert.deepEqual(result.playerDelta, {
    playerId: PLAYER.id,
    seasonClubId: HOME,
    pointsDelta: 2,
    deltas: {
      fieldGoalsMade: 1, fieldGoalsAttempted: 1,
      twoPointsMade: 1, twoPointsAttempted: 1,
      threePointsMade: 0, threePointsAttempted: 0,
      fourPointsMade: 0, fourPointsAttempted: 0,
      freeThrowsMade: 0, freeThrowsAttempted: 0,
      ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0,
      ultraTimeTwoPointsMade: 0, ultraTimeTwoPointsAttempted: 0,
      ultraTimeThreePointsMade: 0, ultraTimeThreePointsAttempted: 0,
      ultraTimeFourPointsMade: 0, ultraTimeFourPointsAttempted: 0,
      ultraTimeFreeThrowsMade: 0, ultraTimeFreeThrowsAttempted: 0,
    },
  });

  assert.deepEqual(result.teamDelta, {
    seasonClubId: HOME,
    deltas: { fourPointsMade: 0, fourPointsAttempted: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 },
    ultraTimePointsForDelta: 0,
    ultraTimePointsAgainstDelta: 0,
    absolutePoints: 2,
  });

  assert.equal(result.opponentUltraDelta, null, "a non-Ultra Time shot never touches the opponent's stat row");
});

test("computeScoreConsequences: a made 3PT shot increments threePoints, not twoPoints", () => {
  const result = computeScoreConsequences(baseInput({ shotValue: 3 }));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.eventFields.basePointValue, 3);
  assert.equal(result.eventFields.points, 3);
  assert.equal(result.playerDelta?.deltas.threePointsMade, 1);
  assert.equal(result.playerDelta?.deltas.threePointsAttempted, 1);
  assert.equal(result.playerDelta?.deltas.twoPointsMade, 0);
  assert.equal(result.playerDelta?.deltas.fieldGoalsMade, 1);
});

test("computeScoreConsequences: a made 4PT shot increments fourPoints and sets isFourPointAttempt, and mirrors into TeamDelta.deltas (the one shot category TeamStat carries)", () => {
  const result = computeScoreConsequences(baseInput({ shotValue: 4 }));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.eventFields.basePointValue, 4);
  assert.equal(result.eventFields.points, 4);
  assert.equal(result.eventFields.isFourPointAttempt, true);
  assert.equal(result.playerDelta?.deltas.fourPointsMade, 1);
  assert.equal(result.playerDelta?.deltas.fourPointsAttempted, 1);
  assert.equal(result.teamDelta.deltas.fourPointsMade, 1);
  assert.equal(result.teamDelta.deltas.fourPointsAttempted, 1);
});

test("computeScoreConsequences: a made free throw (1PT) increments freeThrows, NOT fieldGoals - the one shot category that isn't a field goal", () => {
  const result = computeScoreConsequences(baseInput({ shotValue: 1 }));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.eventFields.basePointValue, 1);
  assert.equal(result.playerDelta?.deltas.freeThrowsMade, 1);
  assert.equal(result.playerDelta?.deltas.freeThrowsAttempted, 1);
  assert.equal(result.playerDelta?.deltas.fieldGoalsMade, 0, "shotStatDeltas only sets fieldGoalsMade for basePointValue >= 2");
  assert.equal(result.playerDelta?.deltas.fieldGoalsAttempted, 0);
});

test("computeScoreConsequences: an Ultra Time 2PT shot doubles points via multiplier, keeps the base category at 2PT, credits the shooter's own ultraTimePointsFor, and credits the opponent's ultraTimePointsAgainst without touching the opponent's own score", () => {
  // period 2, <=60s remaining -> Ultra Time under LEGACY_RULE_SNAPSHOT (periodCount 2,
  // ultraTimeStartRemainingSeconds 60, ultraTimeAppliesFinalPeriodOnly true, multiplier 2).
  const result = computeScoreConsequences(baseInput({ shotValue: 2, currentPeriod: 2, remainingClockSeconds: 45 }));
  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.equal(result.eventFields.basePointValue, 2, "the base shot category is still 2PT - the multiplier doubles points, not the reported category");
  assert.equal(result.eventFields.multiplier, 2);
  assert.equal(result.eventFields.points, 4, "2 base points * 2x multiplier = 4");
  assert.equal(result.eventFields.isUltraTime, true);
  assert.equal(result.eventFields.description, "+4 points (Ultra Time: 2×2)");
  assert.deepEqual(result.fixtureDelta, { isHome: true, previousScore: 0, nextScore: 4, actualPoints: 4 });

  assert.equal(result.playerDelta?.deltas.twoPointsMade, 1, "the base category is recorded once, unmultiplied");
  assert.equal(result.playerDelta?.deltas.ultraTimeTwoPointsMade, 1, "the Ultra Time-specific category is also recorded once");
  assert.equal(result.playerDelta?.deltas.ultraTimeFieldGoalsMade, 1);
  assert.equal(result.playerDelta?.pointsDelta, 4);

  assert.equal(result.teamDelta.ultraTimePointsForDelta, 4, "the shooting team's own Ultra Time points-for tally");
  assert.equal(result.teamDelta.absolutePoints, 4);

  assert.deepEqual(result.opponentUltraDelta, {
    seasonClubId: AWAY,
    ultraTimePointsAgainstDelta: 4,
    absolutePoints: 0,
  }, "the opponent's own score (0, unchanged) is what absolutePoints carries - it is not a delta");
});

test("computeScoreConsequences: away team scoring - homeScoreBefore/After stay untouched, awayScoreBefore/After change, and the opponent-side delta resolves to the HOME club", () => {
  // period 2, <=60s remaining, away team already leading 10-6 before this shot.
  const result = computeScoreConsequences(baseInput({
    shotValue: 2, currentPeriod: 2, remainingClockSeconds: 30,
    seasonClubId: AWAY, opposingSeasonClubId: HOME, isHome: false,
    homeScore: 6, awayScore: 10,
  }));
  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.deepEqual(result.fixtureDelta, { isHome: false, previousScore: 10, nextScore: 14, actualPoints: 4 });
  assert.deepEqual(
    { homeBefore: result.eventFields.homeScoreBefore, homeAfter: result.eventFields.homeScoreAfter, awayBefore: result.eventFields.awayScoreBefore, awayAfter: result.eventFields.awayScoreAfter },
    { homeBefore: 6, homeAfter: 6, awayBefore: 10, awayAfter: 14 },
  );
  assert.equal(result.teamDelta.seasonClubId, AWAY);
  assert.deepEqual(result.opponentUltraDelta, {
    seasonClubId: HOME,
    ultraTimePointsAgainstDelta: 4,
    absolutePoints: 6,
  }, "the opponent here is the HOME club, and absolutePoints reflects ITS current score (6), not the scoring team's");
});

test("computeScoreConsequences: a manual negative correction is never multiplied, floors the score at zero, and produces no PlayerDelta when the actual effect is zero", () => {
  const result = computeScoreConsequences(baseInput({ shotValue: -2, homeScore: 0 }));
  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.deepEqual(result.fixtureDelta, { isHome: true, previousScore: 0, nextScore: 0, actualPoints: 0 }, "Math.max(0, 0 + -2) floors at 0, so the actual change is 0, not -2");
  assert.equal(result.eventFields.points, 0);
  assert.equal(result.eventFields.basePointValue, null, "shotValue <= 0 is a correction, never attributed a shot category");
  assert.equal(result.eventFields.multiplier, null);
  assert.equal(result.eventFields.made, null);
  assert.equal(result.eventFields.description, "0 points");
  assert.equal(result.playerDelta, null, "a zero-effect correction must not fabricate a PlayerDelta, even with a player attached");
  assert.equal(result.teamDelta.absolutePoints, 0);
  assert.equal(result.opponentUltraDelta, null);
});

test("computeScoreConsequences: a real negative correction that doesn't hit the floor still reports the exact requested reduction", () => {
  const result = computeScoreConsequences(baseInput({ shotValue: -2, homeScore: 10 }));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.fixtureDelta, { isHome: true, previousScore: 10, nextScore: 8, actualPoints: -2 });
  assert.equal(result.eventFields.points, -2);
  assert.equal(result.eventFields.description, "-2 points");
  assert.notEqual(result.playerDelta, null, "a nonzero actual effect DOES produce a PlayerDelta, even for a correction");
  assert.equal(result.playerDelta?.pointsDelta, -2);
});

test("computeScoreConsequences: shotValue 0 is rejected as INVALID_SHOT_VALUE, the same error scoreShot itself would produce", () => {
  const result = computeScoreConsequences(baseInput({ shotValue: 0 }));
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.error, "INVALID_SHOT_VALUE");
});

test("computeScoreConsequences: a 4PT shot is rejected as FOUR_POINT_DISABLED when the rule snapshot disables it", () => {
  const result = computeScoreConsequences(baseInput({
    shotValue: 4,
    rules: {
      fourPointEnabled: false, fourPointBaseValue: 4,
      ultraTimeEnabled: true, ultraTimeMultiplier: 2,
      ultraTimeStartRemainingSeconds: 60, ultraTimeAppliesFinalPeriodOnly: true,
      periodCount: 2,
    },
  }));
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.error, "FOUR_POINT_DISABLED");
});
