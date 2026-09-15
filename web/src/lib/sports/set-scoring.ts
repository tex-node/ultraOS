// Multi-sport set scoring (volleyball sets). Pure functions only.
//
// Turns per-set rally points into set winners and a match winner, using the sport definition's
// structure (target points, deciding-set target, periods to win) and its WIN_BY rule. This is the
// rule core the capture action calls; GamePeriodScore persists the per-set points.

import type { SportDefinition } from "./types";

export type SetPoints = { period: number; home: number; away: number };

export type SetScoringConfig = {
  pointsToWinPeriod: number;
  decidingPeriodPoints: number;
  winBy: number;
  periodsToWin: number;
  periodCount: number;
};

export type SetResult = {
  period: number;
  home: number;
  away: number;
  deciding: boolean;
  complete: boolean;
  winner: "HOME" | "AWAY" | null;
};

export type MatchSetSummary = {
  sets: SetResult[];
  homeSetsWon: number;
  awaySetsWon: number;
  matchWinner: "HOME" | "AWAY" | null;
  setsToPlay: number;
};

// Only sports whose sets are decided by a rally-point target (volleyball) — tennis sets are games,
// not rally points, and its structure has no pointsToWinPeriod, so it is excluded here.
export function setScoringConfig(definition: SportDefinition): SetScoringConfig | null {
  const structure = definition.structure;
  if (structure.periodType !== "SET" || structure.pointsToWinPeriod === undefined) return null;
  const winBy = definition.rules?.find((rule) => rule.key === "WIN_BY")?.value;
  return {
    pointsToWinPeriod: structure.pointsToWinPeriod,
    decidingPeriodPoints: structure.decidingPeriodPoints ?? structure.pointsToWinPeriod,
    winBy: typeof winBy === "number" ? winBy : 2,
    periodsToWin: structure.periodsToWin ?? Math.ceil(structure.periodCount / 2),
    periodCount: structure.periodCount,
  };
}

export function setTargetPoints(config: SetScoringConfig, period: number): number {
  return period >= config.periodCount ? config.decidingPeriodPoints : config.pointsToWinPeriod;
}

export function isSetComplete(config: SetScoringConfig, period: number, home: number, away: number): boolean {
  const target = setTargetPoints(config, period);
  const leader = Math.max(home, away);
  const lead = Math.abs(home - away);
  return leader >= target && lead >= config.winBy;
}

export function evaluateSets(config: SetScoringConfig, sets: SetPoints[]): MatchSetSummary {
  const results: SetResult[] = sets
    .slice()
    .sort((a, b) => a.period - b.period)
    .map((set) => {
      const complete = isSetComplete(config, set.period, set.home, set.away);
      return {
        period: set.period,
        home: set.home,
        away: set.away,
        deciding: set.period >= config.periodCount,
        complete,
        winner: complete ? (set.home > set.away ? ("HOME" as const) : ("AWAY" as const)) : null,
      };
    });

  const homeSetsWon = results.filter((result) => result.winner === "HOME").length;
  const awaySetsWon = results.filter((result) => result.winner === "AWAY").length;
  const matchWinner =
    homeSetsWon >= config.periodsToWin ? ("HOME" as const) : awaySetsWon >= config.periodsToWin ? ("AWAY" as const) : null;

  return { sets: results, homeSetsWon, awaySetsWon, matchWinner, setsToPlay: config.periodCount };
}

// The set currently in progress: the first set that is not yet complete, or the last set + 1 when
// every played set is complete (bounded by periodCount).
export function currentSetNumber(config: SetScoringConfig, sets: SetPoints[]): number {
  const sorted = sets.slice().sort((a, b) => a.period - b.period);
  for (const set of sorted) {
    if (!isSetComplete(config, set.period, set.home, set.away)) return set.period;
  }
  const last = sorted.length > 0 ? sorted[sorted.length - 1].period : 0;
  return Math.min(config.periodCount, last + 1);
}
