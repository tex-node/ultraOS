// Multi-sport Stage 4 (S4.1/S4.2): rule values resolved from a sport definition plus an optional
// stored config. Pure functions only; no database access. The definition remains the authority:
// a config may only set keys the definition declares, with the declared value type, and anything
// missing falls back to the definition default.

import { z } from "zod";
import type { SportDefinition } from "./types";

export type RuleValue = number | string | boolean;

export const ruleConfigSchema = z.record(z.string(), z.union([z.number(), z.string(), z.boolean()]));
export type RuleConfig = z.infer<typeof ruleConfigSchema>;

export function parseRuleConfig(value: unknown): RuleConfig {
  const result = ruleConfigSchema.safeParse(value ?? {});
  if (!result.success) {
    throw new Error("Invalid rule config: expected a flat map of rule keys to number/string/boolean.");
  }
  return result.data;
}

export function validateRuleConfig(definition: SportDefinition, config: RuleConfig): string[] {
  const issues: string[] = [];
  const declared = new Map((definition.rules ?? []).map((rule) => [rule.key, rule.value]));
  for (const [key, value] of Object.entries(config)) {
    if (!declared.has(key)) {
      issues.push(`Unknown rule "${key}" for ${definition.name}.`);
      continue;
    }
    if (typeof declared.get(key) !== typeof value) {
      issues.push(`Rule "${key}" must be a ${typeof declared.get(key)}.`);
    }
  }
  return issues;
}

// Resolved rule values: definition defaults, with any valid config overrides applied.
export function resolveRuleValues(definition: SportDefinition, config?: RuleConfig | null): Record<string, RuleValue> {
  const values: Record<string, RuleValue> = {};
  for (const rule of definition.rules ?? []) {
    values[rule.key] = rule.value;
  }
  for (const [key, value] of Object.entries(config ?? {})) {
    const declared = (definition.rules ?? []).find((rule) => rule.key === key);
    if (declared && typeof declared.value === typeof value) {
      values[key] = value;
    }
  }
  return values;
}

export type FrozenRules = {
  sportKey: string;
  definitionVersion: number;
  values: Record<string, RuleValue>;
};

export function freezeRuleValues(
  definition: SportDefinition,
  config?: RuleConfig | null,
): FrozenRules {
  return {
    sportKey: definition.key,
    definitionVersion: definition.version,
    values: resolveRuleValues(definition, config),
  };
}

// Legacy basketball RuleSet columns that correspond to declared rule keys. Used only by the
// Stage 4 backfill to derive a first config from existing rows; new sports use config directly.
export const LEGACY_RULE_FIELD_MAP: Record<string, keyof LegacyRuleFields> = {
  ULTRA_TIME_THRESHOLD_SECONDS: "ultraTimeStartRemainingSeconds",
  ULTRA_TIME_MULTIPLIER: "ultraTimeMultiplier",
  FOUR_POINT_BASE_VALUE: "fourPointBaseValue",
  MANDATORY_SUBSTITUTION_POLICY: "mandatorySubstitutionPolicy",
};

export type LegacyRuleFields = {
  ultraTimeStartRemainingSeconds?: number | null;
  ultraTimeMultiplier?: number | null;
  fourPointBaseValue?: number | null;
  mandatorySubstitutionPolicy?: string | null;
};

// Builds a rule config from a legacy basketball RuleSet row: start from definition defaults, then
// apply the mapped legacy columns for keys the definition declares. Unmapped legacy columns
// (periods, clock, enable flags) belong to the definition's structure/capabilities, not rules.
export function ruleConfigFromLegacy(
  definition: SportDefinition,
  legacy: LegacyRuleFields,
): RuleConfig {
  const config: RuleConfig = {};
  for (const rule of definition.rules ?? []) {
    config[rule.key] = rule.value;
  }
  for (const [ruleKey, legacyField] of Object.entries(LEGACY_RULE_FIELD_MAP)) {
    const declared = (definition.rules ?? []).find((rule) => rule.key === ruleKey);
    if (!declared) continue;
    const legacyValue = legacy[legacyField];
    if (legacyValue === undefined || legacyValue === null) continue;
    if (typeof declared.value === typeof legacyValue) {
      config[ruleKey] = legacyValue;
    }
  }
  return config;
}
