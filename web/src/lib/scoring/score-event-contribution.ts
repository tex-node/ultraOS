import type { ShotStatDeltas } from "@/lib/ultra-scoring-engine";
import { addShotStatDeltas, negateShotStatDeltas, shotStatDeltas } from "@/lib/ultra-scoring-engine";

// A SCORE event's full contribution, as one addable/negatable bundle - shared by voidScoreEvent
// (negate only) and correctScoreEvent (negate old, add new). The naive shape - carry a raw
// `isUltraTime: boolean` alongside `points` and combine afterward - breaks under correction: when
// the old and new events disagree on isUltraTime (a correction can turn a plain shot into an
// Ultra-Time one or vice versa), a single combined boolean can't represent "0% from one side, 100%
// from the other". This shape avoids that by resolving each Ultra-Time-gated number (the scoring
// team's "for" contribution, the opposing team's "against" contribution) to a plain number *before*
// combining, at construction time - after that, void and correction are both just
// negate/add over four independent numeric fields, verified field-for-field against
// voidScoreEventAction/correctScoreEventAction's pre-existing (pre-A3a) arithmetic.
export interface ScoreEventContribution {
  // Shot-category deltas (fieldGoalsMade, threePointsMade, etc.) - the same shape applied to both
  // the scoring player's PlayerStat and the scoring team's TeamStat.
  playerDeltas: ShotStatDeltas;
  // The player's (and the scoring team's absolute-score-independent) raw points delta.
  pointsDelta: number;
  // The scoring team's ultraTimePointsFor delta - equal to pointsDelta when the event is an
  // Ultra-Time shot, otherwise 0. Pre-resolved so it can be summed across old/new contributions
  // that don't agree on isUltraTime.
  teamUltraTimeForDelta: number;
  // The opposing team's ultraTimePointsAgainst delta - same gating, opposite side.
  opponentUltraTimeAgainstDelta: number;
}

export function computeScoreEventContribution(
  basePointValue: number | null,
  isUltraTime: boolean,
  points: number,
): ScoreEventContribution {
  return {
    playerDeltas: shotStatDeltas({ basePointValue, isUltraTime }),
    pointsDelta: points,
    teamUltraTimeForDelta: isUltraTime ? points : 0,
    opponentUltraTimeAgainstDelta: isUltraTime ? points : 0,
  };
}

export function negateScoreEventContribution(c: ScoreEventContribution): ScoreEventContribution {
  // `+ 0` normalizes a negated 0 back to a plain 0 (JS produces -0 from `-0`, which is === 0 but
  // fails Object.is/assert.strictEqual comparisons in tests and would print as "-0" if ever
  // logged) - a hygiene fix, not a behavior change, since -0 and 0 are numerically identical.
  return {
    playerDeltas: negateShotStatDeltas(c.playerDeltas),
    pointsDelta: -c.pointsDelta + 0,
    teamUltraTimeForDelta: -c.teamUltraTimeForDelta + 0,
    opponentUltraTimeAgainstDelta: -c.opponentUltraTimeAgainstDelta + 0,
  };
}

export function addScoreEventContributions(a: ScoreEventContribution, b: ScoreEventContribution): ScoreEventContribution {
  return {
    playerDeltas: addShotStatDeltas(a.playerDeltas, b.playerDeltas),
    pointsDelta: a.pointsDelta + b.pointsDelta,
    teamUltraTimeForDelta: a.teamUltraTimeForDelta + b.teamUltraTimeForDelta,
    opponentUltraTimeAgainstDelta: a.opponentUltraTimeAgainstDelta + b.opponentUltraTimeAgainstDelta,
  };
}
