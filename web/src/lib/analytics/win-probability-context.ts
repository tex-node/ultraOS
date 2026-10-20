// Maps a loaded game onto the pure win-probability input (streak v12, Prompt 2).
//
// The pure function knows nothing about Prisma; this file knows nothing about the maths. Keeping the boundary here
// means the feed, the API and the embed all describe the same game state the same way - the alternative is three
// slightly different mappings and three slightly different percentages for the same moment.
import type { SportDefinition } from "@/lib/sports/types";
import { calculateWinProbability, type WinProbability, type WinProbabilityInput } from "./win-probability";

export type GameStateForProbability = {
  definition: SportDefinition;
  status: string;
  homeScore: number;
  awayScore: number;
  period: number;
  clockSecondsRemaining?: number | null;
  /** Tennis/volleyball rally points in the current set, when the caller has them. */
  currentPoints?: { home: number; away: number } | null;
  /** Cricket chase: runs still needed and balls still available. */
  runsNeeded?: number | null;
  ballsRemaining?: number | null;
  currentRunRate?: number | null;
  requiredRunRate?: number | null;
  /** Pre-match historical win rate for the home side, 0..1. */
  priorHomeWin?: number | null;
};

export function buildWinProbabilityInput(state: GameStateForProbability): WinProbabilityInput {
  const definition = state.definition;
  return {
    sportKey: definition.key,
    status: state.status,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    period: state.period,
    periodCount: definition.structure.periodCount,
    clockSecondsRemaining: state.clockSecondsRemaining ?? null,
    periodDurationSeconds: definition.structure.periodDurationSeconds ?? null,
    pointsToWinPeriod: definition.structure.pointsToWinPeriod ?? null,
    currentPoints: state.currentPoints ?? null,
    runsNeeded: state.runsNeeded ?? null,
    ballsRemaining: state.ballsRemaining ?? null,
    currentRunRate: state.currentRunRate ?? null,
    requiredRunRate: state.requiredRunRate ?? null,
    priorHomeWin: state.priorHomeWin ?? null,
    drawsAllowed: definition.scoring.drawsAllowed,
  };
}

export function winProbabilityForGame(state: GameStateForProbability): WinProbability {
  return calculateWinProbability(buildWinProbabilityInput(state));
}
