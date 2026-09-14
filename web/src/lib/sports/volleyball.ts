// Volleyball definition (indoor, rally scoring). Match points follow the standard model
// resolved in the multi-sport architecture, Section 9 (Q4): 3 for a 3-0/3-1 win, 2 for a 3-2
// win, 1 for a 3-2 loss, 0 otherwise; tiebreak by set ratio, then point ratio.

import type { SportDefinition } from "./types";

export const VOLLEYBALL: SportDefinition = {
  key: "VOLLEYBALL",
  slug: "volleyball",
  name: "Volleyball",
  version: 1,
  entities: ["TEAM"],
  structure: {
    periodType: "SET",
    periodCount: 5,
    periodDurationSeconds: 0,
    overtimeDurationSeconds: 0,
    clock: "NONE",
    pointsToWinPeriod: 25,
    decidingPeriodPoints: 15,
    periodsToWin: 3,
  },
  scoring: {
    unit: "point",
    values: [1],
    winCondition: "BEST_OF_PERIODS",
    drawsAllowed: false,
  },
  events: [
    { key: "SERVE", label: "Serve", category: "SERVE", producesMetrics: ["serves"] },
    { key: "ACE", label: "Ace", category: "SERVE", scores: true, pointValues: [1], producesMetrics: ["aces", "points"] },
    { key: "KILL", label: "Kill", category: "ATTACK", scores: true, pointValues: [1], producesMetrics: ["kills", "points"] },
    { key: "ATTACK_ERROR", label: "Attack error", category: "ATTACK", producesMetrics: ["errors"] },
    { key: "BLOCK", label: "Block", category: "BLOCK", scores: true, pointValues: [1], producesMetrics: ["blocks", "points"] },
    { key: "DIG", label: "Dig", category: "DEFENCE", producesMetrics: ["digs"] },
    { key: "SET", label: "Set", category: "POSSESSION", producesMetrics: ["assists"] },
    { key: "RECEPTION_ERROR", label: "Reception error", category: "DEFENCE", producesMetrics: ["errors"] },
    { key: "SERVICE_ERROR", label: "Service error", category: "SERVE", producesMetrics: ["errors"] },
    { key: "ROTATION_FAULT", label: "Rotation fault", category: "DISCIPLINE", producesMetrics: ["errors"] },
    { key: "TIMEOUT", label: "Timeout", category: "GAME_CONTROL" },
    { key: "SUBSTITUTION", label: "Substitution", category: "LINEUP" },
  ],
  metrics: [
    { key: "points", label: "Points", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SCORING", derivedFromEventKeys: ["ACE", "KILL", "BLOCK"], sortOrder: 1 },
    { key: "aces", label: "Aces", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "SERVE", derivedFromEventKeys: ["ACE"], sortOrder: 2 },
    { key: "kills", label: "Kills", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "ATTACK", derivedFromEventKeys: ["KILL"], sortOrder: 3 },
    { key: "blocks", label: "Blocks", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BLOCK", derivedFromEventKeys: ["BLOCK"], sortOrder: 4 },
    { key: "digs", label: "Digs", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "DEFENCE", derivedFromEventKeys: ["DIG"], sortOrder: 5 },
    { key: "assists", label: "Assists", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "POSSESSION", derivedFromEventKeys: ["SET"], sortOrder: 6 },
    { key: "errors", label: "Errors", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "DISCIPLINE", derivedFromEventKeys: ["ATTACK_ERROR", "RECEPTION_ERROR", "SERVICE_ERROR", "ROTATION_FAULT"], sortOrder: 7 },
    { key: "points", label: "Points", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "SCORING", sortOrder: 1 },
  ],
  standings: {
    outcomes: ["WIN", "LOSS"],
    primaryPoints: { model: "VOLLEYBALL_SETS", winSweep: 3, winFive: 2, lossFive: 1, lossSweep: 0 },
    tiebreak: ["LEAGUE_POINTS", "SET_RATIO", "POINT_RATIO", "NAME"],
    secondaryMetrics: ["SETS_WON", "SETS_LOST", "POINTS_WON", "POINTS_LOST"],
  },
  roster: {
    minRoster: 8,
    maxRoster: 12,
    activeCount: 6,
    substitutesAllowed: true,
    positions: ["Outside hitter", "Opposite hitter", "Middle blocker", "Setter", "Libero"],
  },
  surface: { type: "COURT", lengthM: 18, widthM: 9 },
  capabilities: ["SUBSTITUTIONS", "ROTATION"],
};
