// Deterministic lineup stint reconstruction and verified player minutes (G.17, Parts IV-VI).
// Pure functions only. Built exclusively from captured clock snapshots (GameEvent.period +
// GameEvent.clockSeconds, the same "seconds remaining in this period" convention every other
// event already uses) and structured substitution events - never from createdAt wall-clock
// timestamps, which would conflate real-world data-entry lag with in-game elapsed time.
//
// "Never silently repair malformed history" (Part IV): every function here returns an explicit
// invalid/error result for an impossible lineup state rather than guessing past it.
import type { LineupEntry, SubstitutionRecord } from "./lineup";

// Stint reconstruction needs the clock snapshot each substitution actually happened at, which
// deriveLineup()/validateSubstitution() (lineup.ts) don't require - they only care about
// ordering (sequenceNumber). This is the richer shape the caller must supply here.
export type SubstitutionWithClock = SubstitutionRecord & ClockPoint;

export type ClockRuleSnapshot = {
  periodCount: number;
  periodDurationSeconds: number;
  overtimeDurationSeconds: number;
};

// Season Zero and the G.15/G.16 rehearsals never persisted a GameRuleSnapshot - this mirrors
// ultra-scoring-engine.ts's own LEGACY_RULE_SNAPSHOT fallback pattern, extended with the two
// duration fields scoring never needed but the clock model does. Values match the schema's own
// GameRuleSnapshot defaults (600s regulation, 300s overtime).
export const LEGACY_CLOCK_RULE_SNAPSHOT: ClockRuleSnapshot = {
  periodCount: 2,
  periodDurationSeconds: 600,
  overtimeDurationSeconds: 300,
};

export function periodDurationFor(period: number, rules: ClockRuleSnapshot): number {
  return period <= rules.periodCount ? rules.periodDurationSeconds : rules.overtimeDurationSeconds;
}

export type ClockPoint = { period: number; clockSeconds: number };

export type ClockOrderingError = "INVALID_CLOCK_ORDERING";

// Elapsed seconds between two clock points (start must not be later in-game than end).
// clockSeconds counts DOWN within a period, so within one period elapsed = start - end. Across
// periods, sums the remainder of the start period, every full period in between, and the
// elapsed portion of the end period - all derived from periodDurationFor(), never assumed equal.
export function elapsedSecondsBetween(start: ClockPoint, end: ClockPoint, rules: ClockRuleSnapshot): number | ClockOrderingError {
  if (end.period < start.period) return "INVALID_CLOCK_ORDERING";
  if (end.period === start.period) {
    const elapsed = start.clockSeconds - end.clockSeconds;
    if (elapsed < 0) return "INVALID_CLOCK_ORDERING";
    return elapsed;
  }
  let total = start.clockSeconds;
  if (total < 0) return "INVALID_CLOCK_ORDERING";
  for (let p = start.period + 1; p < end.period; p++) {
    total += periodDurationFor(p, rules);
  }
  const endPeriodElapsed = periodDurationFor(end.period, rules) - end.clockSeconds;
  if (endPeriodElapsed < 0) return "INVALID_CLOCK_ORDERING";
  total += endPeriodElapsed;
  return total;
}

export type LineupStint = {
  seasonClubId: string;
  players: string[];
  startPeriod: number;
  startClockSeconds: number;
  endPeriod: number;
  endClockSeconds: number;
  durationSeconds: number;
};

export type StintReconstructionError =
  | "MISSING_STARTING_FIVE"
  | "INVALID_STARTING_FIVE_SIZE"
  | "DUPLICATE_STARTER"
  | "SUBSTITUTION_OUT_NOT_ON_COURT"
  | "SUBSTITUTION_IN_ALREADY_ON_COURT"
  | ClockOrderingError;

export type StintReconstructionResult =
  | { valid: true; stints: LineupStint[] }
  | { valid: false; error: StintReconstructionError; detail?: unknown };

// Reconstructs one team's ordered lineup stints from its starting five and its own ACTIVE
// structured substitutions, up to the game's current/final clock point. Independent per team -
// call once per seasonClubId.
export function reconstructLineupStints(
  seasonClubId: string,
  startingFive: LineupEntry[],
  substitutions: SubstitutionWithClock[],
  gameEnd: ClockPoint,
  rules: ClockRuleSnapshot = LEGACY_CLOCK_RULE_SNAPSHOT,
): StintReconstructionResult {
  const starters = startingFive.filter((s) => s.seasonClubId === seasonClubId).map((s) => s.playerId);
  if (starters.length === 0) return { valid: false, error: "MISSING_STARTING_FIVE" };
  if (new Set(starters).size !== 5 || starters.length !== 5) return { valid: false, error: "INVALID_STARTING_FIVE_SIZE", detail: { count: starters.length } };

  const teamSubs = substitutions.filter((s) => s.seasonClubId === seasonClubId).sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  const stints: LineupStint[] = [];
  let current = new Set(starters);
  let stintStart: ClockPoint = { period: 1, clockSeconds: periodDurationFor(1, rules) };

  function closeStint(at: ClockPoint): StintReconstructionError | null {
    const duration = elapsedSecondsBetween(stintStart, at, rules);
    if (typeof duration !== "number") return duration;
    stints.push({
      seasonClubId,
      players: [...current].sort(),
      startPeriod: stintStart.period,
      startClockSeconds: stintStart.clockSeconds,
      endPeriod: at.period,
      endClockSeconds: at.clockSeconds,
      durationSeconds: duration,
    });
    return null;
  }

  for (const sub of teamSubs) {
    if (!current.has(sub.playerOutId)) return { valid: false, error: "SUBSTITUTION_OUT_NOT_ON_COURT", detail: sub };
    if (current.has(sub.playerInId)) return { valid: false, error: "SUBSTITUTION_IN_ALREADY_ON_COURT", detail: sub };

    const at: ClockPoint = { period: sub.period, clockSeconds: sub.clockSeconds };
    const closeError = closeStint(at);
    if (closeError) return { valid: false, error: closeError, detail: sub };

    // The two guards above (OUT must be on court, IN must not be) already guarantee this swap
    // holds the lineup at exactly 5 - removing one member and adding a different one nets to
    // the same size, so no further size check is needed here.
    current = new Set(current);
    current.delete(sub.playerOutId);
    current.add(sub.playerInId);
    stintStart = at;
  }

  const finalCloseError = closeStint(gameEnd);
  if (finalCloseError) return { valid: false, error: finalCloseError };

  return { valid: true, stints };
}

export type PlayerMinutes = { playerId: string; seconds: number };

export function deriveMinutesFromStints(stints: LineupStint[]): Map<string, number> {
  const seconds = new Map<string, number>();
  for (const stint of stints) {
    for (const playerId of stint.players) {
      seconds.set(playerId, (seconds.get(playerId) ?? 0) + stint.durationSeconds);
    }
  }
  return seconds;
}

export function formatMinutes(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export type MinutesConfidence = "MINUTES_VERIFIED" | "MINUTES_INCOMPLETE" | "MINUTES_UNAVAILABLE";

export type MinutesIntegrityResult = {
  confidence: MinutesConfidence;
  playerSeconds: Map<string, number>;
  teamElapsedSeconds: number;
  expectedTeamPlayerSeconds: number;
  actualTeamPlayerSeconds: number;
  error?: StintReconstructionError;
};

// Part VI's integrity check: for standard 5-player basketball, the sum of every player's
// seconds for a team must equal 5x the team's actual elapsed game time (since exactly 5 players
// are on court at every moment). A mismatch means the reconstructed history is internally
// inconsistent - surfaced honestly as MINUTES_INCOMPLETE rather than trusted anyway.
export function verifyTeamMinutes(
  seasonClubId: string,
  startingFive: LineupEntry[],
  substitutions: SubstitutionWithClock[],
  gameEnd: ClockPoint,
  rules: ClockRuleSnapshot = LEGACY_CLOCK_RULE_SNAPSHOT,
): MinutesIntegrityResult {
  const hasStarters = startingFive.some((s) => s.seasonClubId === seasonClubId);
  if (!hasStarters) {
    return { confidence: "MINUTES_UNAVAILABLE", playerSeconds: new Map(), teamElapsedSeconds: 0, expectedTeamPlayerSeconds: 0, actualTeamPlayerSeconds: 0 };
  }

  const result = reconstructLineupStints(seasonClubId, startingFive, substitutions, gameEnd, rules);
  if (!result.valid) {
    return { confidence: "MINUTES_INCOMPLETE", playerSeconds: new Map(), teamElapsedSeconds: 0, expectedTeamPlayerSeconds: 0, actualTeamPlayerSeconds: 0, error: result.error };
  }

  const teamElapsedSeconds = result.stints.reduce((sum, s) => sum + s.durationSeconds, 0);
  const playerSeconds = deriveMinutesFromStints(result.stints);
  const actualTeamPlayerSeconds = [...playerSeconds.values()].reduce((a, b) => a + b, 0);
  const expectedTeamPlayerSeconds = 5 * teamElapsedSeconds;

  return {
    confidence: actualTeamPlayerSeconds === expectedTeamPlayerSeconds ? "MINUTES_VERIFIED" : "MINUTES_INCOMPLETE",
    playerSeconds, teamElapsedSeconds, expectedTeamPlayerSeconds, actualTeamPlayerSeconds,
  };
}
