// Table tennis definition (singles). Games to 11, win by 2, best of five; the Singles/Doubles
// split follows the tennis precedent (doubles as PAIR entrants arrive later). Like volleyball,
// every scoring button is worth exactly one rally point - pressing "Ace" records one ACE event
// worth one point, never an ace plus a point.

import type { SportDefinition } from "./types";

export const TABLE_TENNIS: SportDefinition = {
  key: "TABLE_TENNIS",
  slug: "table-tennis",
  name: "Table Tennis",
  version: 1,
  entities: ["INDIVIDUAL"],
  structure: {
    periodType: "SET",
    periodCount: 5,
    periodDurationSeconds: 0,
    overtimeDurationSeconds: 0,
    clock: "NONE",
    pointsToWinPeriod: 11,
    decidingPeriodPoints: 11,
    periodsToWin: 3,
  },
  scoring: {
    unit: "point",
    values: [1],
    winCondition: "BEST_OF_PERIODS",
    drawsAllowed: false,
  },
  events: [
    { key: "TABLE_POINT", label: "Point", category: "SCORING", scores: true, pointValues: [1], producesMetrics: ["points"] },
    { key: "ACE", label: "Ace (unreturned serve)", category: "SERVE", scores: true, pointValues: [1], producesMetrics: ["aces", "points"] },
    { key: "FOREHAND_WINNER", label: "Forehand winner", category: "STROKE", scores: true, pointValues: [1], producesMetrics: ["forehandWinners", "points"] },
    { key: "BACKHAND_WINNER", label: "Backhand winner", category: "STROKE", scores: true, pointValues: [1], producesMetrics: ["backhandWinners", "points"] },
    { key: "LOOP_WINNER", label: "Loop winner", category: "STROKE", scores: true, pointValues: [1], producesMetrics: ["loopWinners", "points"] },
    { key: "SMASH_WINNER", label: "Smash winner", category: "STROKE", scores: true, pointValues: [1], producesMetrics: ["smashWinners", "points"] },
    { key: "SERVICE_FAULT", label: "Service fault", category: "SERVE", producesMetrics: ["serviceFaults"] },
    { key: "FORCED_ERROR", label: "Forced error", category: "ERROR", producesMetrics: ["forcedErrors"] },
    { key: "UNFORCED_ERROR", label: "Unforced error", category: "ERROR", producesMetrics: ["unforcedErrors"] },
    { key: "CHOP_ERROR", label: "Chop error", category: "ERROR", producesMetrics: ["chopErrors"] },
    { key: "PUSH_ERROR", label: "Push error", category: "ERROR", producesMetrics: ["pushErrors"] },
    { key: "EDGE_BALL", label: "Edge ball", category: "LUCK", producesMetrics: ["edgeBalls"] },
    { key: "NET_BALL", label: "Net ball", category: "LUCK", producesMetrics: ["netBalls"] },
    { key: "TIMEOUT", label: "Timeout", category: "GAME_CONTROL" },
  ],
  metrics: [
    { key: "points", label: "Points", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SCORING", derivedFromEventKeys: ["TABLE_POINT", "ACE", "FOREHAND_WINNER", "BACKHAND_WINNER", "LOOP_WINNER", "SMASH_WINNER"], sortOrder: 1 },
    { key: "aces", label: "Aces", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SERVE", derivedFromEventKeys: ["ACE"], sortOrder: 2 },
    { key: "forehandWinners", label: "Forehand winners", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "STROKE", derivedFromEventKeys: ["FOREHAND_WINNER"], sortOrder: 3 },
    { key: "backhandWinners", label: "Backhand winners", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "STROKE", derivedFromEventKeys: ["BACKHAND_WINNER"], sortOrder: 4 },
    { key: "serviceFaults", label: "Service faults", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SERVE", derivedFromEventKeys: ["SERVICE_FAULT"], sortOrder: 5 },
    { key: "forcedErrors", label: "Forced errors", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "ERROR", derivedFromEventKeys: ["FORCED_ERROR"], sortOrder: 6 },
    { key: "unforcedErrors", label: "Unforced errors", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "ERROR", derivedFromEventKeys: ["UNFORCED_ERROR"], sortOrder: 7 },
    { key: "points", label: "Points", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "SCORING", sortOrder: 1 },
    { key: "unforcedErrors", label: "Unforced errors", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "ERROR", sortOrder: 2 },
  ],
  standings: {
    outcomes: ["WIN", "LOSS"],
    primaryPoints: { model: "WIN_DRAW_LOSS", win: 1, draw: 0, loss: 0 },
    tiebreak: ["LEAGUE_POINTS", "HEAD_TO_HEAD", "SET_RATIO", "POINT_RATIO", "NAME"],
    secondaryMetrics: ["SETS_WON", "SETS_LOST"],
  },
  surface: { type: "TABLE" },
  defaultDivisions: ["Singles"],
  capabilities: [],
  rules: [
    { key: "WIN_BY", value: 2, label: "Points ahead to win a game" },
    { key: "MATCH_GAMES", value: 5, label: "Games per match (best of)" },
    { key: "EXPEDITE_ENABLED", value: false, label: "Expedite system in effect" },
  ],
  constraints: [
    { key: "SCORING_EVENT_REQUIRES_ACTOR", label: "Scoring events must name a player or entrant", context: "EVENT", severity: "BLOCK" },
  ],
};