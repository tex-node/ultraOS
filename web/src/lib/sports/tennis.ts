// Tennis definition. Singles is an INDIVIDUAL Entrant and doubles a PAIR; no Club or roster
// applies. The first competition format is a round-robin league table (architecture Section 9,
// Q2), so scoring is expressed as best-of-sets and standings as win/loss with set-ratio
// tiebreaks. Single-elimination brackets are a later structure, not this definition.

import type { SportDefinition } from "./types";

export const TENNIS: SportDefinition = {
  key: "TENNIS",
  slug: "tennis",
  name: "Tennis",
  version: 1,
  entities: ["INDIVIDUAL", "PAIR"],
  structure: {
    periodType: "SET",
    periodCount: 5,
    periodDurationSeconds: 0,
    overtimeDurationSeconds: 0,
    clock: "NONE",
    periodsToWin: 3,
    gamesPerSet: 6,
    decidingPeriodPoints: 10,
  },
  scoring: {
    unit: "point",
    values: [1],
    winCondition: "BEST_OF_PERIODS",
    drawsAllowed: false,
  },
  events: [
    { key: "POINT", label: "Point", category: "SCORING" },
    { key: "ACE", label: "Ace", category: "SERVE", producesMetrics: ["aces"] },
    { key: "DOUBLE_FAULT", label: "Double fault", category: "SERVE", producesMetrics: ["doubleFaults"] },
    { key: "WINNER", label: "Winner", category: "SCORING", producesMetrics: ["winners"] },
    { key: "UNFORCED_ERROR", label: "Unforced error", category: "ERROR", producesMetrics: ["unforcedErrors"] },
    { key: "BREAK_POINT_WON", label: "Break point won", category: "SCORING", producesMetrics: ["breakPointsWon"] },
    { key: "GAME_WON", label: "Game won", category: "SCORING", producesMetrics: ["gamesWon"] },
    { key: "SET_WON", label: "Set won", category: "SCORING", scores: true, pointValues: [1], producesMetrics: ["setsWon"] },
    { key: "MEDICAL_TIMEOUT", label: "Medical timeout", category: "GAME_CONTROL" },
  ],
  metrics: [
    { key: "aces", label: "Aces", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SERVE", derivedFromEventKeys: ["ACE"], sortOrder: 1 },
    { key: "doubleFaults", label: "Double faults", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SERVE", derivedFromEventKeys: ["DOUBLE_FAULT"], sortOrder: 2 },
    { key: "winners", label: "Winners", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SCORING", derivedFromEventKeys: ["WINNER"], sortOrder: 3 },
    { key: "unforcedErrors", label: "Unforced errors", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "ERROR", derivedFromEventKeys: ["UNFORCED_ERROR"], sortOrder: 4 },
    { key: "breakPointsWon", label: "Break points won", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SCORING", derivedFromEventKeys: ["BREAK_POINT_WON"], sortOrder: 5 },
    { key: "setsWon", label: "Sets won", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SCORING", derivedFromEventKeys: ["SET_WON"], sortOrder: 6 },
    { key: "setsWon", label: "Sets won", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "SCORING", sortOrder: 1 },
    { key: "gamesWon", label: "Games won", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "SCORING", sortOrder: 2 },
  ],
  standings: {
    outcomes: ["WIN", "LOSS"],
    primaryPoints: { model: "WIN_DRAW_LOSS", win: 1, draw: 0, loss: 0 },
    tiebreak: ["LEAGUE_POINTS", "WINS", "SET_RATIO", "GAME_RATIO", "HEAD_TO_HEAD", "NAME"],
    secondaryMetrics: ["SETS_WON", "SETS_LOST", "GAMES_WON", "GAMES_LOST"],
  },
  surface: { type: "COURT", lengthM: 23.77, widthM: 10.97 },
  defaultDivisions: ["Singles", "Doubles"],
  capabilities: [],
  rules: [
    { key: "SETS_TO_WIN", value: 3, label: "Sets needed to win the match" },
    { key: "GAMES_PER_SET", value: 6, label: "Games per set" },
    { key: "TIEBREAK_ENABLED", value: true, label: "Tiebreak at 6-6" },
  ],
  constraints: [
    { key: "SCORING_EVENT_REQUIRES_ACTOR", label: "Scoring events must name a player or entrant", context: "EVENT", severity: "BLOCK" },
  ],
};
