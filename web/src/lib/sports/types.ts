// Multi-sport definitions. See documentation/architecture/MULTI_SPORT_ARCHITECTURE.md, Section 5.1.
//
// A SportDefinition is the single authority for a sport's structure, scoring, events, metrics,
// standings, roster, surface, and optional capabilities. Consumers read a resolved definition
// rather than hardcoding sport-specific constants. Definitions are code-registered (see
// registry.ts); database-backed overrides may customize them per organization in a later stage.

export type SportEntity = "TEAM" | "INDIVIDUAL" | "PAIR" | "RELAY";

export type CapabilityKey =
  | "DRAFT"
  | "SHOT_CLOCK"
  | "ULTRA_TIME"
  | "FOUR_POINT"
  | "SUBSTITUTIONS"
  | "INNINGS"
  | "ROTATION"
  | "SURFACE_VISION"
  | "EXTRA_TIME"
  | "PENALTIES";

export type PeriodType = "HALF" | "QUARTER" | "SET" | "INNING" | "PERIOD" | "NONE";

export type ClockBehaviour = "RUNNING" | "STOPPAGE" | "COUNT_UP" | "NONE";

export type StructureSpec = {
  periodType: PeriodType;
  periodCount: number;
  periodDurationSeconds: number;
  overtimeDurationSeconds: number;
  clock: ClockBehaviour;
  shotClockSeconds?: number;
  pointsToWinPeriod?: number;
  decidingPeriodPoints?: number;
  periodsToWin?: number;
  oversPerInnings?: number;
  gamesPerSet?: number;
};

export type ScoringSpec = {
  unit: string;
  values: number[];
  winCondition: "HIGHEST_SCORE" | "HIGHEST_RUNS" | "BEST_OF_PERIODS";
  drawsAllowed: boolean;
};

export type SportEventDefinition = {
  key: string;
  label: string;
  category: string;
  scores?: boolean;
  pointValues?: number[];
  producesMetrics?: string[];
};

export type StatValueType = "COUNT" | "DURATION" | "DECIMAL" | "PERCENTAGE";
export type StatSubject = "PLAYER" | "ENTRANT";
export type StatAggregation = "SUM" | "MAX" | "MIN" | "AVERAGE" | "RATIO";

export type SportMetricDefinition = {
  key: string;
  label: string;
  valueType: StatValueType;
  subject: StatSubject;
  aggregation: StatAggregation;
  category?: string;
  derivedFromEventKeys?: string[];
  sortOrder?: number;
};

export type SportRuleValue = {
  key: string;
  value: number | string | boolean;
  label?: string;
};

export type ConstraintContext = "EVENT" | "LINEUP" | "PERIOD_TRANSITION" | "SUBMISSION";
export type ConstraintSeverity = "BLOCK" | "WARN";

// Entry-time validation declared per sport. `key` references a code-registered validator in
// validators.ts; the engine only knows that the constraint applies, not what it means.
// BLOCK prevents the action; WARN records an issue but allows it.
export type SportConstraint = {
  key: string;
  label: string;
  context: ConstraintContext;
  severity: ConstraintSeverity;
};

export type StandingsOutcome = "WIN" | "DRAW" | "LOSS" | "NO_RESULT" | "TIE";

export type StandingsPrimaryPoints =
  | { model: "WIN_DRAW_LOSS"; win: number; draw: number; loss: number; noResult?: number }
  | { model: "VOLLEYBALL_SETS"; winSweep: number; winFive: number; lossFive: number; lossSweep: number }
  | { model: "CRICKET"; win: number; tie: number; draw: number; noResult: number };

export type StandingsTiebreakKey =
  | "LEAGUE_POINTS"
  | "WINS"
  | "POINT_DIFFERENCE"
  | "POINTS_FOR"
  | "HEAD_TO_HEAD"
  | "FAIR_PLAY"
  | "GOAL_DIFFERENCE"
  | "GOALS_FOR"
  | "SET_RATIO"
  | "POINT_RATIO"
  | "GAME_RATIO"
  | "NET_RUN_RATE"
  | "NAME";

export type StandingsSpec = {
  outcomes: StandingsOutcome[];
  primaryPoints: StandingsPrimaryPoints;
  tiebreak: StandingsTiebreakKey[];
  secondaryMetrics?: string[];
};

export type RosterSpec = {
  minRoster: number;
  maxRoster: number;
  activeCount?: number;
  substitutesAllowed: boolean;
  orderRequired?: boolean;
  positions?: string[];
};

export type SurfaceSpec = {
  type: "COURT" | "PITCH" | "FIELD" | "TABLE";
  lengthM?: number;
  widthM?: number;
};

export type SportDefinition = {
  key: string;
  slug: string;
  name: string;
  version: number;
  entities: SportEntity[];
  structure: StructureSpec;
  scoring: ScoringSpec;
  events: SportEventDefinition[];
  metrics: SportMetricDefinition[];
  standings: StandingsSpec;
  roster?: RosterSpec;
  surface?: SurfaceSpec;
  defaultDivisions?: string[];
  capabilities: CapabilityKey[];
  rules?: SportRuleValue[];
  constraints: SportConstraint[];
};
