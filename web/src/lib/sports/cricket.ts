// Cricket definition (limited-overs default). Ball-by-ball capture is the resolved granularity
// (architecture Section 9, Q3); dot balls are retained because they affect balls faced and
// economy. Standings use points with net run rate as the primary tiebreak.

import type { SportDefinition } from "./types";

export const CRICKET: SportDefinition = {
  key: "CRICKET",
  slug: "cricket",
  name: "Cricket",
  version: 1,
  entities: ["TEAM"],
  structure: {
    periodType: "INNING",
    periodCount: 2,
    periodDurationSeconds: 0,
    overtimeDurationSeconds: 0,
    clock: "NONE",
    oversPerInnings: 20,
    periodsToWin: 2,
  },
  scoring: {
    unit: "run",
    values: [1, 2, 3, 4, 6],
    winCondition: "HIGHEST_RUNS",
    drawsAllowed: true,
  },
  events: [
    { key: "RUN", label: "Runs", category: "SCORING", scores: true, pointValues: [1, 2, 3], producesMetrics: ["runs", "points"] },
    { key: "FOUR", label: "Four", category: "SCORING", scores: true, pointValues: [4], producesMetrics: ["runs", "fours", "points"] },
    { key: "SIX", label: "Six", category: "SCORING", scores: true, pointValues: [6], producesMetrics: ["runs", "sixes", "points"] },
    { key: "DOT_BALL", label: "Dot ball", category: "DELIVERY", producesMetrics: ["ballsFaced", "ballsBowled"] },
    { key: "WICKET", label: "Wicket", category: "DISMISSAL", producesMetrics: ["wickets"] },
    { key: "EXTRAS_WIDE", label: "Wide", category: "EXTRAS", scores: true, pointValues: [1] },
    { key: "EXTRAS_NO_BALL", label: "No ball", category: "EXTRAS", scores: true, pointValues: [1] },
    { key: "EXTRAS_BYE", label: "Bye", category: "EXTRAS", scores: true, pointValues: [1] },
    { key: "EXTRAS_LEG_BYE", label: "Leg bye", category: "EXTRAS", scores: true, pointValues: [1] },
    { key: "OVER_COMPLETE", label: "Over complete", category: "GAME_CONTROL" },
  ],
  metrics: [
    { key: "points", label: "Runs", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["RUN", "FOUR", "SIX"], sortOrder: 1 },
    { key: "ballsFaced", label: "Balls faced", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["RUN", "FOUR", "SIX", "DOT_BALL"], sortOrder: 2 },
    { key: "fours", label: "Fours", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["FOUR"], sortOrder: 3 },
    { key: "sixes", label: "Sixes", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BATTING", derivedFromEventKeys: ["SIX"], sortOrder: 4 },
    { key: "wickets", label: "Wickets", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BOWLING", derivedFromEventKeys: ["WICKET"], sortOrder: 5 },
    { key: "oversBowled", label: "Overs bowled", valueType: "DECIMAL", subject: "PLAYER", aggregation: "SUM", category: "BOWLING", sortOrder: 6 },
    { key: "runsConceded", label: "Runs conceded", valueType: "COUNT", subject: "PLAYER", aggregation: "SUM", category: "BOWLING", sortOrder: 7 },
    { key: "points", label: "Runs", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "BATTING", sortOrder: 1 },
    { key: "wickets", label: "Wickets", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "BOWLING", sortOrder: 2 },
  ],
  standings: {
    outcomes: ["WIN", "DRAW", "LOSS", "TIE", "NO_RESULT"],
    primaryPoints: { model: "CRICKET", win: 2, tie: 1, draw: 1, noResult: 1 },
    tiebreak: ["LEAGUE_POINTS", "NET_RUN_RATE", "WINS", "HEAD_TO_HEAD", "NAME"],
    secondaryMetrics: ["NET_RUN_RATE", "RUNS_FOR", "OVERS_FACED", "RUNS_AGAINST", "OVERS_BOWLED"],
  },
  roster: {
    minRoster: 11,
    maxRoster: 15,
    activeCount: 11,
    substitutesAllowed: true,
    positions: ["Batter", "Bowler", "All-rounder", "Wicket-keeper"],
  },
  surface: { type: "PITCH" },
  capabilities: ["INNINGS", "SUBSTITUTIONS"],
};
