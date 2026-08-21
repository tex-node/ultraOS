// Server-authoritative scoring engine for Ultra Basketball's canonical rules. Pure functions
// only (no Prisma, no I/O) so they're trivially unit-testable and reusable from both the
// existing scorer console path (games/actions.ts) and future native code paths (API routes,
// the evolved GameEvent ledger). Every value a client could otherwise forge — the multiplier,
// whether Ultra Time is active, whether a 4PT attempt is even legal for this game — is derived
// here from server-held state, never trusted from the caller.
//
// A game played under the legacy hardcoded ULTRA_RULES (i.e. any game without a persisted
// GameRuleSnapshot — this covers every Season Zero game) scores identically to before this
// module existed: LEGACY_RULE_SNAPSHOT is just ULTRA_RULES reshaped into RuleSnapshotForScoring.
import { ULTRA_RULES } from "@/lib/game-rules";

export type RuleSnapshotForScoring = {
  fourPointEnabled: boolean;
  fourPointBaseValue: number;
  ultraTimeEnabled: boolean;
  ultraTimeMultiplier: number;
  ultraTimeStartRemainingSeconds: number;
  ultraTimeAppliesFinalPeriodOnly: boolean;
  periodCount: number;
};

export const LEGACY_RULE_SNAPSHOT: RuleSnapshotForScoring = {
  fourPointEnabled: true,
  fourPointBaseValue: 4,
  ultraTimeEnabled: true,
  ultraTimeMultiplier: ULTRA_RULES.ultraTimeMultiplier,
  ultraTimeStartRemainingSeconds: ULTRA_RULES.ultraTimeThresholdSeconds,
  ultraTimeAppliesFinalPeriodOnly: true,
  periodCount: ULTRA_RULES.halves,
};

export function isUltraTimeUnderRules(
  rules: RuleSnapshotForScoring,
  gameStatus: string,
  currentPeriod: number,
  remainingClockSeconds: number,
): boolean {
  if (!rules.ultraTimeEnabled) return false;
  if (gameStatus !== "LIVE") return false;
  if (rules.ultraTimeAppliesFinalPeriodOnly && currentPeriod < rules.periodCount) return false;
  return remainingClockSeconds > 0 && remainingClockSeconds <= rules.ultraTimeStartRemainingSeconds;
}

export type ScoreShotInput = {
  rules: RuleSnapshotForScoring;
  // The shot value as reported by the scorer: 1-4 for a make, negative for a manual
  // scoreboard correction. Never a pre-multiplied total - the engine derives that itself.
  shotValue: number;
  gameStatus: string;
  currentPeriod: number;
  remainingClockSeconds: number;
};

export type ScoreShotError = "INVALID_SHOT_VALUE" | "FOUR_POINT_DISABLED";

export type ScoreShotResult =
  | {
      valid: true;
      basePointValue: number | null;
      multiplier: number | null;
      pointsAwarded: number;
      isUltraTime: boolean;
    }
  | { valid: false; error: ScoreShotError };

export function scoreShot(input: ScoreShotInput): ScoreShotResult {
  const { rules, shotValue } = input;

  if (!Number.isInteger(shotValue) || shotValue === 0 || shotValue < -4 || shotValue > 4) {
    return { valid: false, error: "INVALID_SHOT_VALUE" };
  }

  if (shotValue <= 0) {
    // A manual scoreboard correction, not a shot attempt - never multiplied, never subject
    // to the 4PT-enabled check (it isn't claiming a 4PT shot happened).
    return { valid: true, basePointValue: null, multiplier: null, pointsAwarded: shotValue, isUltraTime: false };
  }

  if (shotValue === 4 && !rules.fourPointEnabled) {
    return { valid: false, error: "FOUR_POINT_DISABLED" };
  }

  const ultraTime = isUltraTimeUnderRules(rules, input.gameStatus, input.currentPeriod, input.remainingClockSeconds);
  const multiplier = ultraTime ? rules.ultraTimeMultiplier : 1;
  return {
    valid: true,
    basePointValue: shotValue,
    multiplier,
    pointsAwarded: shotValue * multiplier,
    isUltraTime: ultraTime,
  };
}

export type UltraTimeTransition = "STARTED" | "ENDED" | null;

// Ultra Time is otherwise inferred fresh from the clock on every read (isUltraTimeUnderRules
// above). This compares that live-computed state against the last *persisted* state
// (Game.isUltraTimeActive) and reports whether a transition needs to be recorded - so the
// ledger gets an explicit ULTRA_TIME_STARTED/ULTRA_TIME_ENDED event instead of only ever
// being able to reconstruct the boundary retrospectively from clock values.
export function detectUltraTimeTransition(
  rules: RuleSnapshotForScoring,
  previouslyActive: boolean,
  gameStatus: string,
  currentPeriod: number,
  remainingClockSeconds: number,
): { isActive: boolean; transition: UltraTimeTransition } {
  const isActive = isUltraTimeUnderRules(rules, gameStatus, currentPeriod, remainingClockSeconds);
  if (isActive === previouslyActive) return { isActive, transition: null };
  return { isActive, transition: isActive ? "STARTED" : "ENDED" };
}

// Per-shot stat deltas, derived purely from the shot's own basePointValue/isUltraTime - never
// re-evaluated against "now". Used identically to apply a new shot's effect and (negated) to
// reverse a voided/corrected one, so the two directions can never drift out of sync with each
// other. Every field here is something a native live-scored game genuinely captures (a shot
// either was or wasn't a given type), so writing 0 - rather than leaving it null/NOT_CAPTURED -
// is correct once a game has any native scoring at all; only categories nothing in the scorer
// UI captures yet (e.g. assist attribution) stay null.
export type ShotStatDeltas = {
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  twoPointsMade: number;
  twoPointsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  fourPointsMade: number;
  fourPointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  ultraTimeFieldGoalsMade: number;
  ultraTimeFieldGoalsAttempted: number;
  ultraTimeTwoPointsMade: number;
  ultraTimeTwoPointsAttempted: number;
  ultraTimeThreePointsMade: number;
  ultraTimeThreePointsAttempted: number;
  ultraTimeFourPointsMade: number;
  ultraTimeFourPointsAttempted: number;
  ultraTimeFreeThrowsMade: number;
  ultraTimeFreeThrowsAttempted: number;
};

const ZERO_SHOT_DELTAS: ShotStatDeltas = {
  fieldGoalsMade: 0,
  fieldGoalsAttempted: 0,
  twoPointsMade: 0,
  twoPointsAttempted: 0,
  threePointsMade: 0,
  threePointsAttempted: 0,
  fourPointsMade: 0,
  fourPointsAttempted: 0,
  freeThrowsMade: 0,
  freeThrowsAttempted: 0,
  ultraTimeFieldGoalsMade: 0,
  ultraTimeFieldGoalsAttempted: 0,
  ultraTimeTwoPointsMade: 0,
  ultraTimeTwoPointsAttempted: 0,
  ultraTimeThreePointsMade: 0,
  ultraTimeThreePointsAttempted: 0,
  ultraTimeFourPointsMade: 0,
  ultraTimeFourPointsAttempted: 0,
  ultraTimeFreeThrowsMade: 0,
  ultraTimeFreeThrowsAttempted: 0,
};

export function shotStatDeltas(shot: { basePointValue: number | null; isUltraTime: boolean }): ShotStatDeltas {
  if (shot.basePointValue === null) return { ...ZERO_SHOT_DELTAS };
  const d: ShotStatDeltas = { ...ZERO_SHOT_DELTAS };
  const isFieldGoal = shot.basePointValue >= 2;

  if (isFieldGoal) {
    d.fieldGoalsMade = 1;
    d.fieldGoalsAttempted = 1;
  }
  if (shot.basePointValue === 1) {
    d.freeThrowsMade = 1;
    d.freeThrowsAttempted = 1;
  } else if (shot.basePointValue === 2) {
    d.twoPointsMade = 1;
    d.twoPointsAttempted = 1;
  } else if (shot.basePointValue === 3) {
    d.threePointsMade = 1;
    d.threePointsAttempted = 1;
  } else if (shot.basePointValue === 4) {
    d.fourPointsMade = 1;
    d.fourPointsAttempted = 1;
  }

  if (shot.isUltraTime) {
    if (isFieldGoal) {
      d.ultraTimeFieldGoalsMade = 1;
      d.ultraTimeFieldGoalsAttempted = 1;
    }
    if (shot.basePointValue === 1) {
      d.ultraTimeFreeThrowsMade = 1;
      d.ultraTimeFreeThrowsAttempted = 1;
    } else if (shot.basePointValue === 2) {
      d.ultraTimeTwoPointsMade = 1;
      d.ultraTimeTwoPointsAttempted = 1;
    } else if (shot.basePointValue === 3) {
      d.ultraTimeThreePointsMade = 1;
      d.ultraTimeThreePointsAttempted = 1;
    } else if (shot.basePointValue === 4) {
      d.ultraTimeFourPointsMade = 1;
      d.ultraTimeFourPointsAttempted = 1;
    }
  }

  return d;
}

export function negateShotStatDeltas(d: ShotStatDeltas): ShotStatDeltas {
  const negated = { ...d };
  for (const key of Object.keys(negated) as (keyof ShotStatDeltas)[]) {
    negated[key] = -negated[key];
  }
  return negated;
}

export function addShotStatDeltas(a: ShotStatDeltas, b: ShotStatDeltas): ShotStatDeltas {
  const sum = { ...a };
  for (const key of Object.keys(sum) as (keyof ShotStatDeltas)[]) {
    sum[key] = sum[key] + b[key];
  }
  return sum;
}

export type ReplayableEvent = {
  seasonClubId: string | null;
  points: number | null;
  status: "ACTIVE" | "VOIDED" | "CORRECTED" | "SUPERSEDED";
};

// Reconstructs a game's score purely by summing the `points` delta of ACTIVE-status events
// for each side. This is the ledger-replay invariant the whole void/correction design relies
// on: `points` on every event already holds the actual (post-clamp) delta that was applied at
// write time, and status alone decides whether an event still counts - VOIDED/CORRECTED
// events are excluded, so a corrected event's superseding replacement (itself ACTIVE) is
// counted instead. Never re-derives points from basePointValue/multiplier here - only a
// literal replay, matching exactly what the write path persisted.
export function replayScore(
  events: ReplayableEvent[],
  homeSeasonClubId: string,
  awaySeasonClubId: string,
): { homeScore: number; awayScore: number } {
  let home = 0;
  let away = 0;
  for (const event of events) {
    if (event.status !== "ACTIVE" || !event.points) continue;
    if (event.seasonClubId === homeSeasonClubId) home += event.points;
    else if (event.seasonClubId === awaySeasonClubId) away += event.points;
  }
  return { homeScore: Math.max(0, home), awayScore: Math.max(0, away) };
}

// Builds the effective rule-snapshot-shaped input for a game: the real persisted
// GameRuleSnapshot when one exists, otherwise the legacy defaults every pre-canonical-model
// game (all of Season Zero) implicitly played under.
export function effectiveRuleSnapshot(
  snapshot: Pick<
    RuleSnapshotForScoring,
    | "fourPointEnabled"
    | "fourPointBaseValue"
    | "ultraTimeEnabled"
    | "ultraTimeMultiplier"
    | "ultraTimeStartRemainingSeconds"
    | "ultraTimeAppliesFinalPeriodOnly"
    | "periodCount"
  > | null,
): RuleSnapshotForScoring {
  return snapshot ?? LEGACY_RULE_SNAPSHOT;
}
