// Baseball definition (streak v11, Prompt 2).
//
// Nine innings, no clock. The scoring unit is a RUN, but baseball is NOT cricket: no overs, no wickets, and a side
// bats once per inning rather than for a fixed number of balls. It therefore has its own scoring module
// (BASEBALL_RUNS) instead of borrowing the innings/overs engine - the innings engine's `inningsConfig` requires
// `oversPerInnings`, which baseball does not have, and pretending it does would give the console overs it cannot
// track.
//
// Draws are not allowed: a level game after nine innings goes to extra innings.

import type { SportDefinition } from "./types";

export const BASEBALL: SportDefinition = {
  key: "BASEBALL",
  slug: "baseball",
  name: "Baseball",
  version: 1,
  entities: ["TEAM"],
  structure: {
    periodType: "INNING",
    periodCount: 9,
    periodDurationSeconds: 0,
    overtimeDurationSeconds: 0,
    clock: "NONE",
  },
  scoring: {
    unit: "run",
    values: [1, 2, 3, 4],
    winCondition: "HIGHEST_SCORE",
    drawsAllowed: false,
  },
  events: [
    { key: "SINGLE", label: "Single", category: "HIT", scores: true, pointValues: [1], producesMetrics: ["hits", "runs", "points"] },
    { key: "DOUBLE", label: "Double", category: "HIT", scores: true, pointValues: [2], producesMetrics: ["hits", "runs", "points"] },
    { key: "TRIPLE", label: "Triple", category: "HIT", scores: true, pointValues: [3], producesMetrics: ["hits", "runs", "points"] },
    { key: "HOME_RUN", label: "Home run", category: "HIT", scores: true, pointValues: [4], producesMetrics: ["hits", "homeRuns", "runs", "points"] },
    { key: "WALK", label: "Walk", category: "PLATE_APPEARANCE", scores: true, pointValues: [1], producesMetrics: ["walks"] },
    { key: "RUN", label: "Run (other)", category: "SCORING", scores: true, pointValues: [1], producesMetrics: ["runs", "points"] },
    { key: "STRIKEOUT", label: "Strikeout", category: "PLATE_APPEARANCE", producesMetrics: ["strikeouts"] },
    { key: "OUT", label: "Out", category: "PLATE_APPEARANCE", producesMetrics: ["outs"] },
    { key: "STOLEN_BASE", label: "Stolen base", category: "BASERUNNING", producesMetrics: ["stolenBases"] },
    { key: "ERROR", label: "Error", category: "FIELDING", producesMetrics: ["errors"] },
    { key: "PITCHING_CHANGE", label: "Pitching change", category: "LINEUP" },
  ],
  metrics: [
    { key: "points", label: "Runs", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["SINGLE", "DOUBLE", "TRIPLE", "HOME_RUN", "RUN", "WALK"], sortOrder: 1 },
    { key: "hits", label: "Hits", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["SINGLE", "DOUBLE", "TRIPLE", "HOME_RUN"], sortOrder: 2 },
    { key: "homeRuns", label: "Home runs", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["HOME_RUN"], sortOrder: 3 },
    { key: "walks", label: "Walks", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["WALK"], sortOrder: 4 },
    { key: "strikeouts", label: "Strikeouts", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["STRIKEOUT"], sortOrder: 5 },
    { key: "outs", label: "Outs made", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["OUT"], sortOrder: 6 },
    { key: "stolenBases", label: "Stolen bases", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BASERUNNING", derivedFromEventKeys: ["STOLEN_BASE"], sortOrder: 7 },
    { key: "errors", label: "Errors", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "FIELDING", derivedFromEventKeys: ["ERROR"], sortOrder: 8 },
    { key: "runs", label: "Runs scored", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "SCORING", sortOrder: 1 },
  ],
  standings: {
    outcomes: ["WIN", "LOSS"],
    primaryPoints: { model: "WIN_DRAW_LOSS", win: 1, draw: 0, loss: 0 },
    tiebreak: ["LEAGUE_POINTS", "WINS", "POINT_DIFFERENCE", "POINTS_FOR", "HEAD_TO_HEAD"],
  },
  roster: {
    minRoster: 9,
    maxRoster: 26,
    activeCount: 9,
    substitutesAllowed: true,
    positions: ["Pitcher", "Catcher", "First base", "Second base", "Third base", "Shortstop", "Left field", "Centre field", "Right field", "Designated hitter"],
  },
  capabilities: [],
  constraints: [],
  rules: [
    { key: "INNINGS", value: 9, label: "Innings in a regulation game" },
  ],
};
