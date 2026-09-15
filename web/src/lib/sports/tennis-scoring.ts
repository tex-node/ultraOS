// Multi-sport tennis scoring core. Pure functions only.
//
// Points -> game -> set -> match, including deuce/advantage and the 7-6 tiebreak set. This is the
// rule engine for tennis; wiring it into the shared capture dispatch additionally needs (a) tennis
// live-state (points/games) plumbed through the capture action and (b) individual-entrant fixtures
// (Fixture sides still reference a SeasonClub, which tennis does not have). It is therefore tested
// and ready, not yet registered in the console.

import type { SportDefinition } from "./types";

export type TennisConfig = {
  setsToWin: number;
  gamesPerSet: number;
  tiebreakEnabled: boolean;
  setCount: number;
};

export type TennisPoints = { home: number; away: number };
export type TennisSetGames = { period: number; home: number; away: number };

// Tennis is distinguished from volleyball (also best-of-sets) by gamesPerSet: tennis sets are won
// in games, volleyball sets in rally points (pointsToWinPeriod).
export function tennisConfig(definition: SportDefinition): TennisConfig | null {
  const structure = definition.structure;
  if (structure.periodType !== "SET" || structure.gamesPerSet === undefined) return null;
  const ruleSets = definition.rules?.find((rule) => rule.key === "SETS_TO_WIN")?.value;
  const ruleTiebreak = definition.rules?.find((rule) => rule.key === "TIEBREAK_ENABLED")?.value;
  return {
    setsToWin: typeof ruleSets === "number" ? ruleSets : structure.periodsToWin ?? 2,
    gamesPerSet: structure.gamesPerSet,
    tiebreakEnabled: ruleTiebreak !== false,
    setCount: structure.periodCount,
  };
}

// "0" / "15" / "30" / "40" / "AD" for a side, handling deuce/advantage.
export function pointLabel(points: TennisPoints, side: "HOME" | "AWAY"): string {
  const me = side === "HOME" ? points.home : points.away;
  const opponent = side === "HOME" ? points.away : points.home;
  if (me >= 3 && opponent >= 3) {
    if (me === opponent) return "40";
    return me > opponent ? "AD" : "40";
  }
  return ["0", "15", "30", "40"][Math.min(me, 3)];
}

export function awardPoint(points: TennisPoints, side: "HOME" | "AWAY"): { points: TennisPoints; gameWon: boolean } {
  const next: TennisPoints =
    side === "HOME" ? { home: points.home + 1, away: points.away } : { home: points.home, away: points.away + 1 };
  const leader = Math.max(next.home, next.away);
  const lead = Math.abs(next.home - next.away);
  return { points: next, gameWon: leader >= 4 && lead >= 2 };
}

// A set is won at gamesPerSet with a two-game lead (6-4, 7-5), or at gamesPerSet + 1 when the
// tiebreak is enabled (7-6).
export function isSetComplete(config: TennisConfig, games: { home: number; away: number }): boolean {
  const leader = Math.max(games.home, games.away);
  const lead = Math.abs(games.home - games.away);
  if (config.tiebreakEnabled && leader >= config.gamesPerSet + 1) return true;
  return leader >= config.gamesPerSet && lead >= 2;
}

export function setWinner(config: TennisConfig, games: { home: number; away: number }): "HOME" | "AWAY" | null {
  if (!isSetComplete(config, games)) return null;
  return games.home > games.away ? "HOME" : "AWAY";
}

export function evaluateTennis(
  config: TennisConfig,
  sets: TennisSetGames[],
): { homeSetsWon: number; awaySetsWon: number; matchWinner: "HOME" | "AWAY" | null } {
  let homeSetsWon = 0;
  let awaySetsWon = 0;
  for (const set of sets) {
    const winner = setWinner(config, set);
    if (winner === "HOME") homeSetsWon += 1;
    else if (winner === "AWAY") awaySetsWon += 1;
  }
  const matchWinner = homeSetsWon >= config.setsToWin ? "HOME" : awaySetsWon >= config.setsToWin ? "AWAY" : null;
  return { homeSetsWon, awaySetsWon, matchWinner };
}
