// Association football definition. Draws are first-class; standings use win/draw/loss points
// with goal difference, then goals scored, as the primary tiebreak.

import type { SportDefinition } from "./types";

export const FOOTBALL: SportDefinition = {
  key: "FOOTBALL",
  slug: "football",
  name: "Football",
  version: 1,
  entities: ["TEAM"],
  structure: {
    periodType: "HALF",
    periodCount: 2,
    periodDurationSeconds: 2700,
    overtimeDurationSeconds: 900,
    clock: "RUNNING",
  },
  scoring: {
    unit: "goal",
    values: [1],
    winCondition: "HIGHEST_SCORE",
    drawsAllowed: true,
  },
  events: [
    { key: "GOAL", label: "Goal", category: "SCORING", scores: true, pointValues: [1], producesMetrics: ["goals", "points"] },
    { key: "OWN_GOAL", label: "Own goal", category: "SCORING", scores: true, pointValues: [1] },
    { key: "ASSIST", label: "Assist", category: "SCORING", producesMetrics: ["assists"] },
    { key: "PENALTY_GOAL", label: "Penalty scored", category: "SCORING", scores: true, pointValues: [1], producesMetrics: ["goals", "points"] },
    { key: "PENALTY_MISSED", label: "Penalty missed", category: "SCORING" },
    { key: "SHOT", label: "Shot", category: "ATTACK", producesMetrics: ["shots"] },
    { key: "SHOT_ON_TARGET", label: "Shot on target", category: "ATTACK", producesMetrics: ["shots", "shotsOnTarget"] },
    { key: "CORNER", label: "Corner", category: "SET_PIECE", producesMetrics: ["corners"] },
    { key: "OFFSIDE", label: "Offside", category: "DISCIPLINE", producesMetrics: ["offsides"] },
    { key: "FOUL", label: "Foul", category: "DISCIPLINE", producesMetrics: ["fouls"] },
    { key: "YELLOW_CARD", label: "Yellow card", category: "DISCIPLINE", producesMetrics: ["yellowCards"] },
    { key: "RED_CARD", label: "Red card", category: "DISCIPLINE", producesMetrics: ["redCards"] },
    { key: "SUBSTITUTION", label: "Substitution", category: "LINEUP" },
  ],
  metrics: [
    { key: "points", label: "Goals", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SCORING", derivedFromEventKeys: ["GOAL", "PENALTY_GOAL"], sortOrder: 1 },
    { key: "assists", label: "Assists", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SCORING", derivedFromEventKeys: ["ASSIST"], sortOrder: 2 },
    { key: "shots", label: "Shots", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "ATTACK", derivedFromEventKeys: ["SHOT", "SHOT_ON_TARGET"], sortOrder: 3 },
    { key: "shotsOnTarget", label: "Shots on target", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "ATTACK", derivedFromEventKeys: ["SHOT_ON_TARGET"], sortOrder: 4 },
    { key: "yellowCards", label: "Yellow cards", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "DISCIPLINE", derivedFromEventKeys: ["YELLOW_CARD"], sortOrder: 5 },
    { key: "redCards", label: "Red cards", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "DISCIPLINE", derivedFromEventKeys: ["RED_CARD"], sortOrder: 6 },
    { key: "minutesPlayed", label: "Minutes played", valueType: "DURATION", subject: "PLAYER", aggregation: "SUM", category: "GENERAL", sortOrder: 7 },
    { key: "points", label: "Goals", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "SCORING", sortOrder: 1 },
    { key: "shots", label: "Shots", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "ATTACK", sortOrder: 2 },
  ],
  standings: {
    outcomes: ["WIN", "DRAW", "LOSS"],
    primaryPoints: { model: "WIN_DRAW_LOSS", win: 3, draw: 1, loss: 0 },
    tiebreak: ["LEAGUE_POINTS", "GOAL_DIFFERENCE", "GOALS_FOR", "HEAD_TO_HEAD", "NAME"],
  },
  roster: {
    minRoster: 7,
    maxRoster: 23,
    activeCount: 11,
    substitutesAllowed: true,
    positions: ["Goalkeeper", "Defender", "Midfielder", "Forward"],
  },
  surface: { type: "PITCH", lengthM: 105, widthM: 68 },
  defaultDivisions: ["Men's", "Women's"],
  capabilities: ["SUBSTITUTIONS", "EXTRA_TIME", "PENALTIES"],
  rules: [
    { key: "SUBSTITUTION_LIMIT", value: 5, label: "Substitutions per match" },
    { key: "EXTRA_TIME_ENABLED", value: true, label: "Extra time in knockout matches" },
    { key: "PENALTIES_ENABLED", value: true, label: "Penalty shootout in knockout matches" },
  ],
  constraints: [
    { key: "SCORING_EVENT_REQUIRES_ACTOR", label: "Scoring events must name a player or entrant", context: "EVENT", severity: "BLOCK" },
    { key: "FOOTBALL_SENT_OFF_PLAYER", label: "A sent-off player may not take further part", context: "LINEUP", severity: "BLOCK" },
  ],
};
