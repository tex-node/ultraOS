// Multi-sport scoring-module dispatch. Pure functions only.
//
// One module per scoring family (sets, goals, runs). A single capture action asks the registry for
// the module that supports the sport's definition and applies the delivery, so the server action
// and the console contain no sport-specific branching. Basketball keeps its dedicated scorer path.

import type { SportDefinition } from "./types";
import { applyDelivery, battingSide, chaseTarget, inningsConfig, isInningsComplete, type Innings } from "./innings-scoring";
import { evaluateSets, setScoringConfig } from "./set-scoring";

export type ScoringModuleKind = "SETS" | "GOALS" | "RUNS";

export type ScoringAction = { typeKey: string; label: string; runs?: number };

export type ScoringModuleInput = {
  homeSeasonClubId: string;
  awaySeasonClubId: string;
  currentPeriod: number;
  homeScore: number;
  awayScore: number;
  periodScores: { period: number; home: number; away: number }[];
  periodWickets?: Record<number, number>;
  periodBalls?: Record<number, number>;
  seasonClubId: string;
  typeKey?: string;
  runs?: number;
};

export type ScoringModuleResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      homeScore: number;
      awayScore: number;
      period: { period: number; home: number; away: number } | null;
      points: number | null;
      typeKey: string;
      eventKind: "SCORE" | "NOTE";
      finalize: boolean;
      finalizeWinner: "HOME" | "AWAY" | null;
      nextPeriod?: number;
      note?: string;
    };

export interface SportScoringModule {
  key: string;
  kind: ScoringModuleKind;
  supports(definition: SportDefinition): boolean;
  actions(definition: SportDefinition): ScoringAction[];
  apply(definition: SportDefinition, input: ScoringModuleInput): ScoringModuleResult;
}

function missingSport(): { ok: false; reason: string } {
  return { ok: false, reason: "SPORT_NOT_SUPPORTED" };
}

const volleyballModule: SportScoringModule = {
  key: "VOLLEYBALL_SETS",
  kind: "SETS",
  supports: (definition) => setScoringConfig(definition) !== null,
  actions: () => [
    { typeKey: "RALLY_POINT", label: "Point" },
    { typeKey: "ACE", label: "Ace" },
    { typeKey: "KILL", label: "Kill" },
    { typeKey: "BLOCK", label: "Block" },
  ],
  apply: (definition, input) => {
    const config = setScoringConfig(definition);
    if (!config) return missingSport();
    const home = input.homeSeasonClubId;
    const away = input.awaySeasonClubId;
    if (input.seasonClubId !== home && input.seasonClubId !== away) return { ok: false, reason: "INVALID_TEAM" };
    const isHome = input.seasonClubId === home;

    const played = input.periodScores.map((s) => ({ period: s.period, home: s.home, away: s.away }));
    const period = input.currentPeriod <= config.periodCount ? input.currentPeriod : config.periodCount;
    const existing = played.find((s) => s.period === period);
    const nextHome = (existing?.home ?? 0) + (isHome ? 1 : 0);
    const nextAway = (existing?.away ?? 0) + (isHome ? 0 : 1);

    const nextSets = [...played.filter((s) => s.period !== period), { period, home: nextHome, away: nextAway }].sort(
      (a, b) => a.period - b.period,
    );
    const summary = evaluateSets(config, nextSets);
    const setCompleted = summary.sets.find((s) => s.period === period)?.complete === true;
    const typeKey = input.typeKey ?? "RALLY_POINT";

    return {
      ok: true,
      homeScore: summary.homeSetsWon,
      awayScore: summary.awaySetsWon,
      period: { period, home: nextHome, away: nextAway },
      points: 1,
      typeKey,
      eventKind: "SCORE",
      finalize: summary.matchWinner !== null,
      finalizeWinner: summary.matchWinner,
      nextPeriod: !summary.matchWinner && setCompleted ? Math.min(config.periodCount, period + 1) : undefined,
    };
  },
};

const footballModule: SportScoringModule = {
  key: "FOOTBALL_GOALS",
  kind: "GOALS",
  supports: (definition) => definition.scoring.unit === "goal",
  actions: () => [
    { typeKey: "GOAL", label: "Goal" },
    { typeKey: "PENALTY_GOAL", label: "Penalty" },
    { typeKey: "OWN_GOAL", label: "Own goal" },
  ],
  apply: (_definition, input) => {
    const home = input.homeSeasonClubId;
    const away = input.awaySeasonClubId;
    if (input.seasonClubId !== home && input.seasonClubId !== away) return { ok: false, reason: "INVALID_TEAM" };
    const typeKey = input.typeKey ?? "GOAL";
    const ownGoal = typeKey === "OWN_GOAL";
    const credited = ownGoal ? (input.seasonClubId === home ? away : home) : input.seasonClubId;
    const isHome = credited === home;
    return {
      ok: true,
      homeScore: input.homeScore + (isHome ? 1 : 0),
      awayScore: input.awayScore + (isHome ? 0 : 1),
      period: null,
      points: 1,
      typeKey,
      eventKind: "SCORE",
      finalize: false,
      finalizeWinner: null,
      note: ownGoal ? `Own goal credited to ${isHome ? "home" : "away"}` : undefined,
    };
  },
};

const cricketModule: SportScoringModule = {
  key: "CRICKET_RUNS",
  kind: "RUNS",
  supports: (definition) => definition.scoring.unit === "run",
  actions: () => [
    { typeKey: "RUN", label: "+1", runs: 1 },
    { typeKey: "RUN", label: "+2", runs: 2 },
    { typeKey: "RUN", label: "+3", runs: 3 },
    { typeKey: "FOUR", label: "+4", runs: 4 },
    { typeKey: "SIX", label: "+6", runs: 6 },
    { typeKey: "RUN", label: "Dot", runs: 0 },
    { typeKey: "WICKET", label: "Wicket" },
  ],
  apply: (definition, input) => {
    const config = inningsConfig(definition);
    if (!config) return missingSport();
    const home = input.homeSeasonClubId;
    const away = input.awaySeasonClubId;
    const period = input.currentPeriod <= config.inningsCount ? input.currentPeriod : config.inningsCount;
    const batting = battingSide(config, period);
    const battingSeasonClubId = batting === "HOME" ? home : away;
    if (input.seasonClubId !== battingSeasonClubId) return { ok: false, reason: "NOT_BATTING" };

    const typeKey = input.typeKey ?? "RUN";
    const wicket = typeKey === "WICKET";
    const existing = input.periodScores.find((s) => s.period === period);
    const innings: Innings = {
      period,
      batting,
      runs: existing ? (batting === "HOME" ? existing.home : existing.away) : 0,
      wickets: input.periodWickets?.[period] ?? 0,
      balls: input.periodBalls?.[period] ?? 0,
    };

    const outcome = applyDelivery(config, innings, { runs: input.runs, typeKey, wicket });
    const nextInningsRuns = innings.runs + outcome.runsAdded;
    const nextPeriodScore =
      batting === "HOME"
        ? { period, home: nextInningsRuns, away: existing?.away ?? 0 }
        : { period, home: existing?.home ?? 0, away: nextInningsRuns };

    const isHomeBatting = batting === "HOME";
    const homeScore = input.homeScore + (isHomeBatting ? outcome.runsAdded : 0);
    const awayScore = input.awayScore + (isHomeBatting ? 0 : outcome.runsAdded);

    // Innings 2 chase: reaching the target wins immediately.
    if (period >= 2) {
      const firstInningsRuns = input.homeScore; // home batted innings 1
      const target = chaseTarget(firstInningsRuns);
      if (awayScore >= target) {
        return {
          ok: true,
          homeScore,
          awayScore,
          period: nextPeriodScore,
          points: outcome.runsAdded || null,
          typeKey,
          eventKind: wicket ? "NOTE" : "SCORE",
          finalize: true,
          finalizeWinner: "AWAY",
          note: `Target ${target} reached`,
        };
      }
    }

    if (outcome.inningsComplete) {
      if (period < config.inningsCount) {
        return {
          ok: true,
          homeScore,
          awayScore,
          period: nextPeriodScore,
          points: outcome.runsAdded || null,
          typeKey,
          eventKind: wicket ? "NOTE" : "SCORE",
          finalize: false,
          finalizeWinner: null,
          nextPeriod: period + 1,
        };
      }
      const winner: "HOME" | "AWAY" | null =
        homeScore > awayScore ? "HOME" : awayScore > homeScore ? "AWAY" : null;
      return {
        ok: true,
        homeScore,
        awayScore,
        period: nextPeriodScore,
        points: outcome.runsAdded || null,
        typeKey,
        eventKind: wicket ? "NOTE" : "SCORE",
        finalize: true,
        finalizeWinner: winner,
      };
    }

    return {
      ok: true,
      homeScore,
      awayScore,
      period: nextPeriodScore,
      points: outcome.runsAdded || null,
      typeKey,
      eventKind: wicket ? "NOTE" : "SCORE",
      finalize: false,
      finalizeWinner: null,
    };
  },
};

export const SCORING_MODULES: SportScoringModule[] = [volleyballModule, footballModule, cricketModule];

export function resolveScoringModule(definition: SportDefinition): SportScoringModule | null {
  return SCORING_MODULES.find((candidate) => candidate.supports(definition)) ?? null;
}

export function isInningsSport(definition: SportDefinition): boolean {
  return inningsConfig(definition) !== null;
}

export function isInningsCompleteFor(definition: SportDefinition, innings: Innings): boolean {
  const config = inningsConfig(definition);
  return config ? isInningsComplete(config, innings) : false;
}
