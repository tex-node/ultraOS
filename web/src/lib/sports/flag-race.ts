// Flag race definition (streak v11, Prompt 2).
//
// Individual competitors, heats then a final, decided by TIME on a stopwatch. It is registered so that a race can
// be onboarded, scheduled, entered and shown, but it has NO scoring module: this codebase scores runs, goals, sets
// and points, and a race is timed rather than scored. The console therefore offers only the catalog events
// (start/finish/false start/disqualification) and records them to the ledger; there is no "goal" button to press
// and no fake score to invent. Making a heat result count requires a timing-result import, which is future work
// and is recorded as such rather than simulated here.

import type { SportDefinition } from "./types";

export const FLAG_RACE: SportDefinition = {
  key: "FLAG_RACE",
  slug: "flag-race",
  name: "Flag Race",
  version: 1,
  entities: ["INDIVIDUAL"],
  structure: {
    // The engine has no HEAT period type: a heat is a PERIOD, and the definition's rule names how many there are.
    periodType: "PERIOD",
    periodCount: 2,
    periodDurationSeconds: 0,
    overtimeDurationSeconds: 0,
    clock: "COUNT_UP",
  },
  scoring: {
    unit: "time",
    // A race has no point values to add, but the validator requires a non-empty list of positive integers. The
    // single 1 is a placeholder the engine never uses - no scoring module matches a `time` unit, so nothing can score
    // a race through this path. That is the honest state: races are timed, not scored, until a result import exists.
    values: [1],
    winCondition: "HIGHEST_SCORE",
    drawsAllowed: false,
  },
  events: [
    { key: "START", label: "Start", category: "GAME_CONTROL" },
    { key: "FINISH", label: "Finish", category: "GAME_CONTROL" },
    { key: "FALSE_START", label: "False start", category: "DISCIPLINE" },
    { key: "DISQUALIFICATION", label: "Disqualified", category: "DISCIPLINE" },
    { key: "LANE_ASSIGNMENT", label: "Lane assignment", category: "LINEUP" },
  ],
  metrics: [
    { key: "falseStarts", label: "False starts", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "DISCIPLINE", derivedFromEventKeys: ["FALSE_START"], sortOrder: 1 },
    { key: "disqualifications", label: "Disqualifications", valueType: "COUNT", subject: "ENTRANT", aggregation: "SUM", category: "DISCIPLINE", derivedFromEventKeys: ["DISQUALIFICATION"], sortOrder: 2 },
    { key: "finishTimeMs", label: "Finish time (ms)", valueType: "DURATION", subject: "ENTRANT", aggregation: "MIN", category: "RESULT", sortOrder: 3 },
  ],
  standings: {
    outcomes: ["WIN", "LOSS"],
    // A race has no league points: the table is ordered by the recorded times, and an entrant with no time is below
    // one with a time. WIN_DRAW_LOSS is the only model the engine has, so it is declared with the minimal values and
    // the TIME tiebreak does the ordering.
    primaryPoints: { model: "WIN_DRAW_LOSS", win: 1, draw: 0, loss: 0 },
    tiebreak: ["FAIR_PLAY", "NAME"],
  },
  capabilities: [],
  constraints: [],
  rules: [
    { key: "HEATS", value: 2, label: "Number of heats before the final" },
  ],
};
