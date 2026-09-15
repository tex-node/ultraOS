// Multi-sport match-result helper. Pure functions only.
//
// Whether a level score is a valid final result depends on the sport: football draws and cricket
// ties/no-results are outcomes, while basketball cannot be level (overtime). Used by finalization
// so the same action finalizes any sport correctly.

import type { SportDefinition } from "./types";

export type MatchOutcome = "HOME" | "AWAY" | "DRAW" | "TIE" | "NO_RESULT" | null;

export function matchOutcome(definition: SportDefinition, homeScore: number, awayScore: number): MatchOutcome {
  if (homeScore > awayScore) return "HOME";
  if (awayScore > homeScore) return "AWAY";
  if (!definition.scoring.drawsAllowed) return null; // a level result is not valid for this sport
  return definition.standings.outcomes.includes("TIE") ? "TIE" : "DRAW";
}

export function isDecidedResult(definition: SportDefinition, homeScore: number, awayScore: number): boolean {
  return matchOutcome(definition, homeScore, awayScore) !== null;
}
