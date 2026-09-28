import {
  addScoreEventContributions,
  computeScoreEventContribution,
  negateScoreEventContribution,
} from "./score-event-contribution";
import assert from "node:assert/strict";
import test from "node:test";

test("void: negating a contribution flips every field, including the shot-category deltas", () => {
  const contribution = computeScoreEventContribution(3, false, 3);
  const negated = negateScoreEventContribution(contribution);
  assert.equal(negated.pointsDelta, -3);
  assert.equal(negated.playerDeltas.threePointsMade, -1);
  assert.equal(negated.playerDeltas.threePointsAttempted, -1);
  assert.equal(negated.playerDeltas.fieldGoalsMade, -1);
  assert.equal(negated.teamUltraTimeForDelta, 0);
  assert.equal(negated.opponentUltraTimeAgainstDelta, 0);
});

test("correction, same player + same point value: negate(old) + new nets to all zeros", () => {
  const oldC = computeScoreEventContribution(2, false, 2);
  const newC = computeScoreEventContribution(2, false, 2);
  const net = addScoreEventContributions(negateScoreEventContribution(oldC), newC);
  assert.equal(net.pointsDelta, 0);
  assert.equal(net.teamUltraTimeForDelta, 0);
  assert.equal(net.opponentUltraTimeAgainstDelta, 0);
  for (const key of Object.keys(net.playerDeltas) as (keyof typeof net.playerDeltas)[]) {
    assert.equal(net.playerDeltas[key], 0, `expected ${key} to net to 0`);
  }
});

test("correction, same player + different point value: net reflects the value change, Fixture adjusts by the difference", () => {
  const oldC = computeScoreEventContribution(2, false, 2); // was a 2PT make
  const newC = computeScoreEventContribution(3, false, 3); // corrected to a 3PT make
  const net = addScoreEventContributions(negateScoreEventContribution(oldC), newC);
  assert.equal(net.pointsDelta, 1); // Fixture score moves by +1, not by the full new value
  assert.equal(net.playerDeltas.twoPointsMade, -1);
  assert.equal(net.playerDeltas.twoPointsAttempted, -1);
  assert.equal(net.playerDeltas.threePointsMade, 1);
  assert.equal(net.playerDeltas.threePointsAttempted, 1);
  assert.equal(net.playerDeltas.fieldGoalsMade, 0); // both are field goals, so this cancels
});

test("correction, different player + same point value: reverse on A and apply on B independently, net (team-level) is zero", () => {
  const oldC = computeScoreEventContribution(2, false, 2); // player A's original shot
  const newC = computeScoreEventContribution(2, false, 2); // player B's corrected attribution
  const forPlayerA = negateScoreEventContribution(oldC);
  const forPlayerB = newC;
  assert.equal(forPlayerA.pointsDelta, -2);
  assert.equal(forPlayerB.pointsDelta, 2);
  // Team-level uses the combined net, since the team didn't change - only who scored did.
  const teamNet = addScoreEventContributions(forPlayerA, forPlayerB);
  assert.equal(teamNet.pointsDelta, 0);
  assert.equal(teamNet.playerDeltas.twoPointsMade, 0);
});

test("correction, different player + different point value: reverse on A, apply on B, Fixture adjusts by the difference", () => {
  const oldC = computeScoreEventContribution(2, false, 2); // player A's original 2PT
  const newC = computeScoreEventContribution(4, false, 4); // player B's corrected 4PT
  const forPlayerA = negateScoreEventContribution(oldC);
  const forPlayerB = newC;
  assert.equal(forPlayerA.pointsDelta, -2);
  assert.equal(forPlayerB.pointsDelta, 4);
  const teamNet = addScoreEventContributions(forPlayerA, forPlayerB);
  assert.equal(teamNet.pointsDelta, 2); // Fixture score moves by +2 (4 - 2)
  assert.equal(teamNet.playerDeltas.twoPointsMade, -1);
  assert.equal(teamNet.playerDeltas.fourPointsMade, 1);
});

test("Ultra-Time-against: the opposing team's counter tracks the same gated value as the scoring team's 'for', not the player's raw shot deltas", () => {
  const contribution = computeScoreEventContribution(4, true, 8); // an Ultra-Time 4PT (x2)
  assert.equal(contribution.teamUltraTimeForDelta, 8);
  assert.equal(contribution.opponentUltraTimeAgainstDelta, 8);
  // The opponent gets no shot-category deltas at all - only the against-counter, applied
  // separately by the caller with a zeroed deltas object (mirrors the pre-existing call shape).
  const negated = negateScoreEventContribution(contribution);
  assert.equal(negated.opponentUltraTimeAgainstDelta, -8);
});

test("correction across an Ultra-Time boundary: net 'for'/'against' resolve correctly even though old and new disagree on isUltraTime", () => {
  const oldC = computeScoreEventContribution(2, false, 2); // was a plain 2PT (not Ultra-Time)
  const newC = computeScoreEventContribution(2, true, 4); // corrected to an Ultra-Time 2PT (x2)
  const net = addScoreEventContributions(negateScoreEventContribution(oldC), newC);
  assert.equal(net.pointsDelta, 2); // 4 - 2
  assert.equal(net.teamUltraTimeForDelta, 4); // 0 (old contributed nothing) + 4 (new)
  assert.equal(net.opponentUltraTimeAgainstDelta, 4);
});
