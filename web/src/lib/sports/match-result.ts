// Multi-sport match-result helper. Pure functions only.
//
// Whether a level score is a valid final result depends on the sport: football draws and cricket
// ties/no-results are outcomes, while basketball cannot be level (overtime). Used by finalization
// so the same action finalizes any sport correctly.

import type { SportDefinition } from "./types";

export type MatchOutcome = "HOME" | "AWAY" | "DRAW" | "TIE" | "NO_RESULT" | null;

// In a knockout competition a level score is never a valid result - it must be resolved by extra
// time/penalties, so matchOutcome treats it as undecided.
export function matchOutcome(
  definition: SportDefinition,
  homeScore: number,
  awayScore: number,
  options: { knockout?: boolean } = {},
): MatchOutcome {
  if (homeScore > awayScore) return "HOME";
  if (awayScore > homeScore) return "AWAY";
  if (options.knockout) return null;
  if (!definition.scoring.drawsAllowed) return null; // a level result is not valid for this sport
  return definition.standings.outcomes.includes("TIE") ? "TIE" : "DRAW";
}

export function isDecidedResult(
  definition: SportDefinition,
  homeScore: number,
  awayScore: number,
  options: { knockout?: boolean } = {},
): boolean {
  return matchOutcome(definition, homeScore, awayScore, options) !== null;
}
