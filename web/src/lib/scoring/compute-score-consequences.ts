// Returns the complete set of pure-derivable consequences of a shot: both the fields needed to build
// the GameEvent (`eventFields`) and the stat/fixture deltas its effects will apply (`fixtureDelta`,
// `playerDelta`, `teamDelta`, `opponentUltraDelta`). "Consequences" is deliberate: "effects" is
// reserved for the I/O half that actually applies the deltas (applyScoreEffects, not yet extracted).
//
// Lives here (no Prisma, no server-only) so it is unit-testable without a database, the same split
// as buildGameEventCreateData vs createGameEvent and mergeShotStatDeltas vs
// applyPlayerShotStatDeltas/applyTeamShotStatDeltas.
//
// This is a relocation of recordScoreInternal's (src/app/games/actions-internal.ts) inline
// score/delta math - byte-for-byte the same computation, not a rewrite. recordScoreInternal is not
// changed yet (that's the next commit, once this function's shape is reviewed); today it still does
// this math inline.
//
// Scope: this function assumes the shooting team's seasonClubId has already been validated against
// the fixture's two sides (INVALID_TEAM), and that `player` (if a playerId was given) has already
// been resolved against the roster (INVALID_PLAYER) - both require a DB read the caller has already
// done, so they stay the caller's job, not this function's. The one validity check that IS pure and
// belongs here is scoreShot's own (INVALID_SHOT_VALUE / FOUR_POINT_DISABLED) - surfaced the same
// {valid: false, error} shape scoreShot itself already uses, so a caller checks one thing.
//
// Error translation contract for the caller (recordScoreInternal today throws, never returns an
// error object): `{ valid: false, error }` must be translated back to `throw new Error(error)` at
// the point the inline `if (!shot.valid) throw new Error(shot.error)` sits now - same message,
// thrown inside withGameWrite's callback so the transaction rolls back. Note INVALID_SHOT_VALUE is
// unreachable through recordScoreInternal itself: its input schema (z.number().int().min(-4)
// .max(4), non-zero) rejects every value scoreShot would reject first, as a ZodError.
import {
  effectiveRuleSnapshot,
  scoreShot,
  shotStatDeltas,
  type ShotStatDeltas,
} from "@/lib/ultra-scoring-engine";

export interface ComputeScoreConsequencesInput {
  shotValue: number; // The raw scorer-entered value (score.points): 1-4 for a make, negative for a manual correction.
  rules: Parameters<typeof effectiveRuleSnapshot>[0]; // game.ruleSnapshot, as passed to effectiveRuleSnapshot elsewhere
  gameStatus: string; // game.status
  currentPeriod: number; // game.currentPeriod
  remainingClockSeconds: number; // remainingClockSeconds(game) - computed once by the caller, not re-derived here
  seasonClubId: string; // input.seasonClubId - already validated as one of the fixture's two sides
  opposingSeasonClubId: string; // the OTHER side - isHome ? awaySeasonClubId : homeSeasonClubId
  isHome: boolean;
  homeScore: number; // game.fixture.homeScore (before this shot)
  awayScore: number; // game.fixture.awayScore (before this shot)
  player: { id: string } | null; // already resolved by the caller (or null - a team-only correction)
  description?: string; // input.description - falls back to a generated description when blank
}

export interface FixtureDelta {
  isHome: boolean;
  previousScore: number;
  nextScore: number;
  // The actual, floor-clamped change (Math.max(0, previousScore + pointsAwarded) - previousScore) -
  // never the raw requested pointsAwarded, which a correction below the current score would make
  // negative enough to imply a score below zero.
  actualPoints: number;
}

// Everything createGameEvent needs beyond gameId/fixtureId/seasonClubId/playerId/period/clockSeconds
// (those come from the caller's own context, not from this computation).
export interface ScoreEventFields {
  points: number;
  basePointValue: number | null;
  multiplier: number | null;
  isUltraTime: boolean;
  made: boolean | null;
  isFourPointAttempt: boolean;
  description: string;
  homeScoreBefore: number;
  awayScoreBefore: number;
  homeScoreAfter: number;
  awayScoreAfter: number;
}

export interface PlayerDelta {
  playerId: string;
  seasonClubId: string;
  deltas: ShotStatDeltas;
  pointsDelta: number;
}

// The scoring team's own TeamStat delta - always computed, even for a zero-effect correction
// (matches recordScoreInternal's current unconditional applyTeamShotStatDeltas call for this side).
export interface TeamDelta {
  seasonClubId: string;
  deltas: Pick<ShotStatDeltas, "fourPointsMade" | "fourPointsAttempted" | "ultraTimeFieldGoalsMade" | "ultraTimeFieldGoalsAttempted">;
  ultraTimePointsForDelta: number;
  ultraTimePointsAgainstDelta: number;
  absolutePoints: number;
}

// The opponent's Ultra Time bookkeeping - "the one most likely to be missed" during extraction.
// Null unless this shot was both Ultra Time AND had a nonzero actual effect (matches
// recordScoreInternal's `if (ultraTime && actualPoints !== 0)` guard exactly).
export interface OpponentUltraDelta {
  seasonClubId: string;
  ultraTimePointsAgainstDelta: number;
  absolutePoints: number; // the opponent's OWN score, unchanged by this shot
}

export type ScoreConsequences =
  | {
      valid: true;
      fixtureDelta: FixtureDelta;
      eventFields: ScoreEventFields;
      playerDelta: PlayerDelta | null;
      teamDelta: TeamDelta;
      opponentUltraDelta: OpponentUltraDelta | null;
    }
  | { valid: false; error: string };

export function computeScoreConsequences(input: ComputeScoreConsequencesInput): ScoreConsequences {
  const shot = scoreShot({
    rules: effectiveRuleSnapshot(input.rules),
    shotValue: input.shotValue,
    gameStatus: input.gameStatus,
    currentPeriod: input.currentPeriod,
    remainingClockSeconds: input.remainingClockSeconds,
  });
  if (!shot.valid) return { valid: false, error: shot.error };
  const { basePointValue, multiplier, pointsAwarded, isUltraTime } = shot;

  const previousScore = input.isHome ? input.homeScore : input.awayScore;
  const nextScore = Math.max(0, previousScore + pointsAwarded);
  const actualPoints = nextScore - previousScore;

  const fixtureDelta: FixtureDelta = { isHome: input.isHome, previousScore, nextScore, actualPoints };

  const eventFields: ScoreEventFields = {
    points: actualPoints,
    basePointValue,
    multiplier,
    isUltraTime,
    made: basePointValue !== null ? true : null,
    isFourPointAttempt: basePointValue === 4,
    description:
      input.description ||
      `${actualPoints > 0 ? "+" : ""}${actualPoints} points${isUltraTime && basePointValue ? ` (Ultra Time: ${basePointValue}×${multiplier})` : ""}`,
    homeScoreBefore: input.isHome ? previousScore : input.homeScore,
    awayScoreBefore: input.isHome ? input.awayScore : previousScore,
    homeScoreAfter: input.isHome ? nextScore : input.homeScore,
    awayScoreAfter: input.isHome ? input.awayScore : nextScore,
  };

  const deltas = shotStatDeltas({ basePointValue, isUltraTime });

  const playerDelta: PlayerDelta | null =
    input.player && actualPoints !== 0
      ? { playerId: input.player.id, seasonClubId: input.seasonClubId, deltas, pointsDelta: actualPoints }
      : null;

  const teamDelta: TeamDelta = {
    seasonClubId: input.seasonClubId,
    deltas: {
      fourPointsMade: deltas.fourPointsMade,
      fourPointsAttempted: deltas.fourPointsAttempted,
      ultraTimeFieldGoalsMade: deltas.ultraTimeFieldGoalsMade,
      ultraTimeFieldGoalsAttempted: deltas.ultraTimeFieldGoalsAttempted,
    },
    ultraTimePointsForDelta: isUltraTime ? actualPoints : 0,
    ultraTimePointsAgainstDelta: 0,
    absolutePoints: nextScore,
  };

  const opponentUltraDelta: OpponentUltraDelta | null =
    isUltraTime && actualPoints !== 0
      ? {
          seasonClubId: input.opposingSeasonClubId,
          ultraTimePointsAgainstDelta: actualPoints,
          absolutePoints: input.isHome ? input.awayScore : input.homeScore,
        }
      : null;

  return { valid: true, fixtureDelta, eventFields, playerDelta, teamDelta, opponentUltraDelta };
}
