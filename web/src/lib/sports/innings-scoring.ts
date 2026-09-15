// Multi-sport innings scoring (cricket). Pure functions only.
//
// Tracks runs, wickets, and legal deliveries per innings, decides when an innings ends (overs
// complete or all out), exposes the chase target, and lets the caller resolve the result. Limited
// overs; DLS stays out of scope (disabled by rule).

import type { SportDefinition } from "./types";

export type InningsConfig = {
  oversPerInnings: number;
  wicketsPerInnings: number;
  inningsCount: number;
};

export type Innings = {
  period: number;
  batting: "HOME" | "AWAY";
  runs: number;
  wickets: number;
  balls: number;
};

export type DeliveryInput = {
  runs?: number;
  typeKey?: string;
  wicket?: boolean;
};

export type DeliveryOutcome = {
  runsAdded: number;
  wicketAdded: number;
  legalBall: boolean;
  inningsComplete: boolean;
  resultingWickets: number;
  resultingBalls: number;
};

const ILLEGAL_DELIVERY_KEYS = new Set(["EXTRAS_WIDE", "EXTRAS_NO_BALL"]);

export function inningsConfig(definition: SportDefinition): InningsConfig | null {
  if (definition.structure.periodType !== "INNING") return null;
  const ruleOvers = definition.rules?.find((rule) => rule.key === "OVERS_PER_INNINGS")?.value;
  const overs = typeof ruleOvers === "number" ? ruleOvers : definition.structure.oversPerInnings ?? 0;
  if (!overs || overs <= 0) return null;
  return {
    oversPerInnings: overs,
    wicketsPerInnings: 10,
    inningsCount: definition.structure.periodCount,
  };
}

export function battingSide(config: InningsConfig, period: number): "HOME" | "AWAY" {
  // Limited-overs convention: the home side bats first.
  return period <= 1 ? "HOME" : "AWAY";
}

export function isLegalDelivery(typeKey: string | undefined): boolean {
  return !typeKey || !ILLEGAL_DELIVERY_KEYS.has(typeKey);
}

export function isInningsComplete(config: InningsConfig, innings: Innings): boolean {
  return innings.balls >= config.oversPerInnings * 6 || innings.wickets >= config.wicketsPerInnings;
}

export function applyDelivery(config: InningsConfig, innings: Innings, input: DeliveryInput): DeliveryOutcome {
  const typeKey = input.typeKey;
  const wicket = input.wicket === true || typeKey === "WICKET";
  const runsAdded = wicket ? 0 : input.runs ?? 0;
  const wicketAdded = wicket ? 1 : 0;
  const legalBall = isLegalDelivery(typeKey);
  const resultingWickets = innings.wickets + wicketAdded;
  const resultingBalls = innings.balls + (legalBall ? 1 : 0);
  return {
    runsAdded,
    wicketAdded,
    legalBall,
    resultingWickets,
    resultingBalls,
    inningsComplete:
      resultingBalls >= config.oversPerInnings * 6 || resultingWickets >= config.wicketsPerInnings,
  };
}

export function chaseTarget(firstInningsRuns: number): number {
  return firstInningsRuns + 1;
}

export function oversDisplay(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}
