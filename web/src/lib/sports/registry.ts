// Code registry of sport definitions. This is the authority for sport behaviour
// (documentation/architecture/MULTI_SPORT_ARCHITECTURE.md, Section 5.1 / decision D3).
// Database-backed overrides may customize a definition per organization in a later stage;
// nothing here reads the database.

import type {
  CapabilityKey,
  SportDefinition,
  SportEntity,
  SportMetricDefinition,
} from "./types";
import { BASKETBALL } from "./basketball";
import { VOLLEYBALL } from "./volleyball";
import { FOOTBALL } from "./football";
import { CRICKET } from "./cricket";
import { TENNIS } from "./tennis";
import { isKnownValidator } from "./validators";

export const SPORT_DEFINITIONS = {
  BASKETBALL,
  VOLLEYBALL,
  FOOTBALL,
  CRICKET,
  TENNIS,
} as const;

export type SportKey = keyof typeof SPORT_DEFINITIONS;

export const SPORT_DEFINITION_LIST: SportDefinition[] = Object.values(SPORT_DEFINITIONS);

export function listSportDefinitions(): SportDefinition[] {
  return SPORT_DEFINITION_LIST;
}

export function getSportDefinition(keyOrSlug: string | null | undefined): SportDefinition | null {
  if (!keyOrSlug) return null;
  const normalized = String(keyOrSlug).trim().toLowerCase();
  if (!normalized) return null;
  return (
    SPORT_DEFINITION_LIST.find(
      (definition) =>
        definition.key.toLowerCase() === normalized || definition.slug.toLowerCase() === normalized,
    ) ?? null
  );
}

export function requireSportDefinition(keyOrSlug: string | null | undefined): SportDefinition {
  const definition = getSportDefinition(keyOrSlug);
  if (!definition) {
    throw new Error(
      `Unknown sport "${keyOrSlug ?? ""}". Known sports: ${SPORT_DEFINITION_LIST.map((d) => d.slug).join(", ")}.`,
    );
  }
  return definition;
}

export function capabilityEnabled(definition: SportDefinition, capability: CapabilityKey): boolean {
  return definition.capabilities.includes(capability);
}

export function ruleValue(
  definition: SportDefinition,
  key: string,
): number | string | boolean | undefined {
  return definition.rules?.find((rule) => rule.key === key)?.value;
}

export function metricsFor(
  definition: SportDefinition,
  subject: SportMetricDefinition["subject"],
): SportMetricDefinition[] {
  return definition.metrics
    .filter((metric) => metric.subject === subject)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

// Structural validation used by tests and, later, by database-override writes. Returns a list of
// human-readable issues; an empty list means the definition is well-formed.
export function validateSportDefinition(definition: SportDefinition): string[] {
  const issues: string[] = [];
  if (!definition.key) issues.push("missing key");
  if (!definition.slug) issues.push("missing slug");
  if (!definition.name) issues.push("missing name");
  if (definition.entities.length === 0) issues.push("at least one entity is required");
  if (definition.structure.periodCount < 1) issues.push("structure.periodCount must be at least 1");
  if (definition.structure.periodDurationSeconds < 0) issues.push("period duration must not be negative");
  if (definition.scoring.values.length === 0) issues.push("scoring.values must not be empty");
  if (definition.scoring.values.some((value) => value <= 0)) issues.push("scoring.values must be positive");
  if (definition.standings.tiebreak.length === 0) issues.push("standings.tiebreak must not be empty");
  if (definition.standings.outcomes.length === 0) issues.push("standings.outcomes must not be empty");
  if (definition.entities.includes("TEAM") && !definition.roster) {
    issues.push("team sports require a roster specification");
  }

  const eventKeys = new Set<string>();
  for (const event of definition.events) {
    if (eventKeys.has(event.key)) issues.push(`duplicate event key "${event.key}"`);
    eventKeys.add(event.key);
    for (const value of event.pointValues ?? []) {
      if (!definition.scoring.values.includes(value)) {
        issues.push(`event "${event.key}" references point value ${value} not in scoring.values`);
      }
    }
  }

  const metricKeys = new Set<string>();
  for (const metric of definition.metrics) {
    const scopedKey = `${metric.subject}:${metric.key}`;
    if (metricKeys.has(scopedKey)) issues.push(`duplicate metric "${scopedKey}"`);
    metricKeys.add(scopedKey);
    for (const eventKey of metric.derivedFromEventKeys ?? []) {
      if (!eventKeys.has(eventKey)) {
        issues.push(`metric "${scopedKey}" derives from unknown event "${eventKey}"`);
      }
    }
  }

  const validContexts = new Set(["EVENT", "LINEUP", "PERIOD_TRANSITION", "SUBMISSION"]);
  const validSeverities = new Set(["BLOCK", "WARN"]);
  const seenConstraints = new Set<string>();
  for (const constraint of definition.constraints) {
    if (!constraint.key) {
      issues.push("constraint missing key");
      continue;
    }
    if (seenConstraints.has(constraint.key)) issues.push(`duplicate constraint "${constraint.key}"`);
    seenConstraints.add(constraint.key);
    if (!isKnownValidator(constraint.key)) {
      issues.push(`constraint "${constraint.key}" has no registered validator`);
    }
    if (!validContexts.has(constraint.context)) {
      issues.push(`constraint "${constraint.key}" has invalid context "${constraint.context}"`);
    }
    if (!validSeverities.has(constraint.severity)) {
      issues.push(`constraint "${constraint.key}" has invalid severity "${constraint.severity}"`);
    }
  }

  return issues;
}

export type SportSummary = {
  key: string;
  slug: string;
  name: string;
  version: number;
  entities: SportEntity[];
  entityLabel: string;
  structureSummary: string;
  winConditionSummary: string;
  formatSummary: string;
  capabilities: CapabilityKey[];
};

const ENTITY_LABELS: Record<SportEntity, string> = {
  TEAM: "teams",
  INDIVIDUAL: "individuals",
  PAIR: "pairs",
  RELAY: "relays",
};

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

const PERIOD_NOUNS: Partial<Record<SportDefinition["structure"]["periodType"], [string, string]>> = {
  HALF: ["half", "halves"],
  QUARTER: ["quarter", "quarters"],
  SET: ["set", "sets"],
  INNING: ["inning", "innings"],
  PERIOD: ["period", "periods"],
};

function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}

export function entityLabel(entities: SportEntity[]): string {
  const labels = entities.map((entity) => ENTITY_LABELS[entity]);
  if (labels.length <= 1) return capitalize(labels[0] ?? "");
  return `${capitalize(labels[0])} or ${labels.slice(1).join(" or ")}`;
}

export function describeStructure(definition: SportDefinition): string {
  const { structure } = definition;
  if (structure.periodType === "NONE" || structure.periodCount === 0) return "Open play";
  const nouns = PERIOD_NOUNS[structure.periodType] ?? ["period", "periods"];

  if (structure.periodType === "INNING") {
    const overs = structure.oversPerInnings ? ` of ${structure.oversPerInnings} overs` : "";
    return `${structure.periodCount} ${structure.periodCount === 1 ? nouns[0] : nouns[1]}${overs}`;
  }
  if (structure.periodType === "SET") {
    const base = `Best of ${structure.periodCount} ${nouns[1]}`;
    if (structure.pointsToWinPeriod) {
      const decider = structure.decidingPeriodPoints
        ? `, ${structure.decidingPeriodPoints} in the decider`
        : "";
      return `${base} (${structure.pointsToWinPeriod} points${decider})`;
    }
    return base;
  }
  const duration = structure.periodDurationSeconds > 0 ? ` of ${minutes(structure.periodDurationSeconds)} minutes` : "";
  return `${structure.periodCount} ${structure.periodCount === 1 ? nouns[0] : nouns[1]}${duration}`;
}

export function describeWinCondition(definition: SportDefinition): string {
  const { scoring, structure } = definition;
  if (scoring.winCondition === "BEST_OF_PERIODS") {
    const target = structure.periodsToWin ?? Math.ceil(structure.periodCount / 2);
    const plural = structure.periodType === "SET" ? "sets" : "periods";
    return `first to ${target} ${plural} wins`;
  }
  if (scoring.winCondition === "HIGHEST_RUNS") return "most runs wins";
  return scoring.drawsAllowed ? "highest score wins, draws allowed" : "highest score wins";
}

export function describeSport(definition: SportDefinition): SportSummary {
  const structureSummary = describeStructure(definition);
  const winConditionSummary = describeWinCondition(definition);
  return {
    key: definition.key,
    slug: definition.slug,
    name: definition.name,
    version: definition.version,
    entities: definition.entities,
    entityLabel: entityLabel(definition.entities),
    structureSummary,
    winConditionSummary,
    formatSummary: `${structureSummary} · ${winConditionSummary}`,
    capabilities: definition.capabilities,
  };
}

export function listSportSummaries(): SportSummary[] {
  return SPORT_DEFINITION_LIST.map(describeSport);
}
