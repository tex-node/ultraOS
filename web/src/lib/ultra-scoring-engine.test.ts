import assert from "node:assert/strict";
import test from "node:test";
import {
  addShotStatDeltas,
  detectUltraTimeTransition,
  effectiveRuleSnapshot,
  isUltraTimeUnderRules,
  LEGACY_RULE_SNAPSHOT,
  negateShotStatDeltas,
  replayScore,
  scoreShot,
  shotStatDeltas,
  type RuleSnapshotForScoring,
} from "./ultra-scoring-engine";

const RULES: RuleSnapshotForScoring = LEGACY_RULE_SNAPSHOT;
const RULES_NO_4PT: RuleSnapshotForScoring = { ...RULES, fourPointEnabled: false };

test("scoreShot awards an unmultiplied 2PT outside Ultra Time", () => {
  const result = scoreShot({ rules: RULES, shotValue: 2, gameStatus: "LIVE", currentPeriod: 1, remainingClockSeconds: 500 });
  assert.deepEqual(result, { valid: true, basePointValue: 2, multiplier: 1, pointsAwarded: 2, isUltraTime: false });
});

test("scoreShot doubles a made shot inside Ultra Time (final period, <=60s remaining)", () => {
  const result = scoreShot({ rules: RULES, shotValue: 3, gameStatus: "LIVE", currentPeriod: 2, remainingClockSeconds: 45 });
  assert.deepEqual(result, { valid: true, basePointValue: 3, multiplier: 2, pointsAwarded: 6, isUltraTime: true });
});

test("scoreShot rejects a 4PT attempt when the rule snapshot disables it", () => {
  const result = scoreShot({ rules: RULES_NO_4PT, shotValue: 4, gameStatus: "LIVE", currentPeriod: 2, remainingClockSeconds: 30 });
  assert.deepEqual(result, { valid: false, error: "FOUR_POINT_DISABLED" });
});

test("scoreShot allows a 4PT attempt and doubles it in Ultra Time when enabled", () => {
  const result = scoreShot({ rules: RULES, shotValue: 4, gameStatus: "LIVE", currentPeriod: 2, remainingClockSeconds: 10 });
  assert.deepEqual(result, { valid: true, basePointValue: 4, multiplier: 2, pointsAwarded: 8, isUltraTime: true });
});

test("scoreShot never multiplies a manual scoreboard correction, even inside Ultra Time", () => {
  const result = scoreShot({ rules: RULES, shotValue: -3, gameStatus: "LIVE", currentPeriod: 2, remainingClockSeconds: 10 });
  assert.deepEqual(result, { valid: true, basePointValue: null, multiplier: null, pointsAwarded: -3, isUltraTime: false });
});

// G.15 test matrix items 1-8: every shot value (1PT/2PT/3PT/4PT), in and out of Ultra Time.
test("scoreShot: every shot value scores base value outside Ultra Time and double inside it", () => {
  const outsideUltraTime = { gameStatus: "LIVE" as const, currentPeriod: 1, remainingClockSeconds: 500 };
  const insideUltraTime = { gameStatus: "LIVE" as const, currentPeriod: 2, remainingClockSeconds: 30 };

  for (const shotValue of [1, 2, 3, 4]) {
    const outside = scoreShot({ rules: RULES, shotValue, ...outsideUltraTime });
    assert.deepEqual(outside, { valid: true, basePointValue: shotValue, multiplier: 1, pointsAwarded: shotValue, isUltraTime: false }, `${shotValue}PT outside Ultra Time`);

    const inside = scoreShot({ rules: RULES, shotValue, ...insideUltraTime });
    assert.deepEqual(inside, { valid: true, basePointValue: shotValue, multiplier: 2, pointsAwarded: shotValue * 2, isUltraTime: true }, `${shotValue}PT inside Ultra Time`);
  }
});

test("scoreShot rejects impossible shot values", () => {
  for (const shotValue of [0, 5, -5, 1.5]) {
    const result = scoreShot({ rules: RULES, shotValue, gameStatus: "LIVE", currentPeriod: 2, remainingClockSeconds: 30 });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.error, "INVALID_SHOT_VALUE");
  }
});

test("isUltraTimeUnderRules requires LIVE status, final period, and the clock window", () => {
  assert.equal(isUltraTimeUnderRules(RULES, "PAUSED", 2, 30), false, "paused game is never in Ultra Time");
  assert.equal(isUltraTimeUnderRules(RULES, "LIVE", 1, 30), false, "first half never qualifies (final-period-only rule)");
  assert.equal(isUltraTimeUnderRules(RULES, "LIVE", 2, 61), false, "just outside the 60s window");
  assert.equal(isUltraTimeUnderRules(RULES, "LIVE", 2, 60), true, "exactly at the 60s window");
  assert.equal(isUltraTimeUnderRules(RULES, "LIVE", 2, 0), false, "clock expired");
  assert.equal(isUltraTimeUnderRules({ ...RULES, ultraTimeEnabled: false }, "LIVE", 2, 30), false, "disabled at the rule level");
});

test("detectUltraTimeTransition reports STARTED and ENDED exactly at the boundary", () => {
  const started = detectUltraTimeTransition(RULES, false, "LIVE", 2, 45);
  assert.deepEqual(started, { isActive: true, transition: "STARTED" });

  const ended = detectUltraTimeTransition(RULES, true, "LIVE", 2, 400);
  assert.deepEqual(ended, { isActive: false, transition: "ENDED" });

  const unchanged = detectUltraTimeTransition(RULES, true, "LIVE", 2, 30);
  assert.deepEqual(unchanged, { isActive: true, transition: null });

  const pauseEndsIt = detectUltraTimeTransition(RULES, true, "PAUSED", 2, 30);
  assert.deepEqual(pauseEndsIt, { isActive: false, transition: "ENDED" }, "pausing during Ultra Time ends it");
});

test("effectiveRuleSnapshot falls back to legacy ULTRA_RULES-derived defaults for games with no persisted snapshot", () => {
  assert.deepEqual(effectiveRuleSnapshot(null), LEGACY_RULE_SNAPSHOT);
  const custom: RuleSnapshotForScoring = { ...RULES, fourPointEnabled: false, ultraTimeMultiplier: 3 };
  assert.deepEqual(effectiveRuleSnapshot(custom), custom);
});

test("shotStatDeltas categorizes each shot type correctly, in and out of Ultra Time", () => {
  const twoPointMake = shotStatDeltas({ basePointValue: 2, isUltraTime: false });
  assert.equal(twoPointMake.fieldGoalsMade, 1);
  assert.equal(twoPointMake.twoPointsMade, 1);
  assert.equal(twoPointMake.threePointsMade, 0);
  assert.equal(twoPointMake.ultraTimeFieldGoalsMade, 0, "not in Ultra Time, so no Ultra Time deltas");

  const fourPointUltraMake = shotStatDeltas({ basePointValue: 4, isUltraTime: true });
  assert.equal(fourPointUltraMake.fieldGoalsMade, 1);
  assert.equal(fourPointUltraMake.fourPointsMade, 1);
  assert.equal(fourPointUltraMake.ultraTimeFieldGoalsMade, 1);
  assert.equal(fourPointUltraMake.ultraTimeFourPointsMade, 1);
  assert.equal(fourPointUltraMake.ultraTimeThreePointsMade, 0);

  const freeThrow = shotStatDeltas({ basePointValue: 1, isUltraTime: false });
  assert.equal(freeThrow.freeThrowsMade, 1);
  assert.equal(freeThrow.fieldGoalsMade, 0, "a free throw is never a field goal");

  const manualCorrection = shotStatDeltas({ basePointValue: null, isUltraTime: false });
  for (const value of Object.values(manualCorrection)) assert.equal(value, 0);
});

test("negateShotStatDeltas and addShotStatDeltas are exact inverses/identities", () => {
  const deltas = shotStatDeltas({ basePointValue: 3, isUltraTime: true });
  const roundTrip = addShotStatDeltas(deltas, negateShotStatDeltas(deltas));
  for (const value of Object.values(roundTrip)) assert.equal(value, 0);
});

test("correction math: 2PT -> 3PT nets +1 threePointsMade, -1 twoPointsMade, +1 point", () => {
  const original = shotStatDeltas({ basePointValue: 2, isUltraTime: false });
  const corrected = shotStatDeltas({ basePointValue: 3, isUltraTime: false });
  const net = addShotStatDeltas(negateShotStatDeltas(original), corrected);
  assert.equal(net.twoPointsMade, -1);
  assert.equal(net.threePointsMade, 1);
  assert.equal(net.fieldGoalsMade, 0, "still exactly one field goal either way");
});

test("correction math: 3PT -> 4PT nets +1 fourPointsMade, -1 threePointsMade", () => {
  const original = shotStatDeltas({ basePointValue: 3, isUltraTime: false });
  const corrected = shotStatDeltas({ basePointValue: 4, isUltraTime: false });
  const net = addShotStatDeltas(negateShotStatDeltas(original), corrected);
  assert.equal(net.threePointsMade, -1);
  assert.equal(net.fourPointsMade, 1);
});

test("correction math: made -> void fully reverses the shot's deltas and its points", () => {
  const original = shotStatDeltas({ basePointValue: 2, isUltraTime: true });
  const reversed = negateShotStatDeltas(original);
  assert.equal(reversed.twoPointsMade, -1);
  assert.equal(reversed.ultraTimeTwoPointsMade, -1);
  // A void reverses the event's own recorded points delta directly (see
  // voidScoreEventAction) - here that would be -4 for an Ultra-Time-doubled 2PT make.
});

test("correction math: Ultra Time multiplier correction (non-Ultra 2PT -> Ultra-Time 2PT) changes only the Ultra Time split", () => {
  const original = shotStatDeltas({ basePointValue: 2, isUltraTime: false });
  const corrected = shotStatDeltas({ basePointValue: 2, isUltraTime: true });
  const net = addShotStatDeltas(negateShotStatDeltas(original), corrected);
  assert.equal(net.twoPointsMade, 0, "still one 2PT make either way");
  assert.equal(net.ultraTimeTwoPointsMade, 1, "now attributed to Ultra Time");
});

test("replayScore reproduces the persisted score, ignoring voided/corrected/superseded events", () => {
  const homeId = "home-club";
  const awayId = "away-club";
  const events = [
    { seasonClubId: homeId, points: 2, status: "ACTIVE" as const },
    { seasonClubId: awayId, points: 6, status: "ACTIVE" as const },
    // A 2PT that was later corrected up to a 3PT: the original is excluded (CORRECTED),
    // only the superseding +1 delta event (ACTIVE) counts.
    { seasonClubId: homeId, points: 2, status: "CORRECTED" as const },
    { seasonClubId: homeId, points: 1, status: "ACTIVE" as const },
    // A made shot that was fully voided.
    { seasonClubId: awayId, points: 4, status: "VOIDED" as const },
  ];
  const { homeScore, awayScore } = replayScore(events, homeId, awayId);
  assert.equal(homeScore, 3);
  assert.equal(awayScore, 6);
});

test("replayScore clamps a negative net total at zero, same as the live write path", () => {
  const homeId = "home-club";
  const awayId = "away-club";
  const events = [{ seasonClubId: homeId, points: -5, status: "ACTIVE" as const }];
  assert.equal(replayScore(events, homeId, awayId).homeScore, 0);
});

test("replayScore ignores game/period-level events with no seasonClubId (e.g. Ultra Time transitions)", () => {
  const homeId = "home-club";
  const awayId = "away-club";
  const events = [
    { seasonClubId: null, points: null, status: "ACTIVE" as const },
    { seasonClubId: homeId, points: 3, status: "ACTIVE" as const },
  ];
  const { homeScore, awayScore } = replayScore(events, homeId, awayId);
  assert.equal(homeScore, 3);
  assert.equal(awayScore, 0);
});
