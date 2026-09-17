// Per-season rule values (a competition's format) with an organization-wide fallback.
//
// A RuleSet is scoped to a season, and a season belongs to one competition - so a RuleSet is how a
// single tournament plays a different format from another tournament of the same sport. Resolution
// order: season RuleSet -> organization SportDefinitionOverride -> the code definition's own defaults.
//
// The code registry stays the authority: an override can only replace declared rule keys.

import type { Prisma } from "@/generated/prisma/client";
import type { SportDefinition } from "./types";

export type RuleValueMap = Record<string, number | string | boolean>;

export type ResolvedRuleValues = {
  values: RuleValueMap;
  source: "SEASON" | "ORGANIZATION" | "DEFINITION";
};

function declaredDefaults(definition: SportDefinition): RuleValueMap {
  const values: RuleValueMap = {};
  for (const rule of definition.rules ?? []) values[rule.key] = rule.value;
  return values;
}

function readRuleValues(config: unknown): RuleValueMap {
  if (!config || typeof config !== "object") return {};
  const rules = (config as { rules?: unknown }).rules;
  if (rules && typeof rules === "object" && !Array.isArray(rules)) {
    return rules as RuleValueMap;
  }
  // A RuleSet created before the multi-sport config shape stored the values flat.
  return config as RuleValueMap;
}

export async function loadSeasonRuleSet(
  tx: Prisma.TransactionClient,
  organizationId: string,
  seasonId: string,
  sportId?: string | null,
) {
  return tx.ruleSet.findFirst({
    where: { organizationId, seasonId, isActive: true, ...(sportId ? { sportId } : {}) },
    orderBy: { version: "desc" },
  });
}

// Effective rule values for a game in this season: season RuleSet over the organization override over
// the definition. Only declared keys survive, so a stale row can never invent a rule.
export async function resolveSeasonRuleValues(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; seasonId: string; sportId: string | null; definition: SportDefinition },
): Promise<ResolvedRuleValues> {
  const declared = declaredDefaults(input.definition);

  const override = input.sportId
    ? await tx.sportDefinitionOverride.findFirst({
        where: { organizationId: input.organizationId, sportId: input.sportId, isActive: true },
        orderBy: { version: "desc" },
      })
    : null;

  const seasonRuleSet = input.sportId
    ? await loadSeasonRuleSet(tx, input.organizationId, input.seasonId, input.sportId)
    : null;

  const values: RuleValueMap = { ...declared };
  let source: ResolvedRuleValues["source"] = "DEFINITION";

  if (override) {
    const overrideRules = readRuleValues(override.config);
    for (const [key, value] of Object.entries(overrideRules)) {
      if (key in declared && typeof value === typeof declared[key]) values[key] = value;
    }
    source = "ORGANIZATION";
  }

  if (seasonRuleSet) {
    const seasonRules = readRuleValues(seasonRuleSet.config);
    for (const [key, value] of Object.entries(seasonRules)) {
      if (key in declared && typeof value === typeof declared[key]) values[key] = value;
    }
    source = "SEASON";
  }

  return { values, source };
}

// Creates (or replaces) the season's rule set from a set of rule values. RuleSet keeps legacy
// basketball structure columns, so they are mirrored for readers that still use them.
export async function upsertSeasonRuleSet(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    seasonId: string;
    sportId: string;
    name: string;
    ruleValues: RuleValueMap;
  },
) {
  const structure = {
    periodCount: Number(input.ruleValues.PERIOD_COUNT ?? 2),
    periodDurationSeconds: Number(input.ruleValues.PERIOD_MINUTES ?? 10) * 60,
    overtimeDurationSeconds: Number(input.ruleValues.OVERTIME_MINUTES ?? 5) * 60,
    shotClockSeconds: Number(input.ruleValues.SHOT_CLOCK_SECONDS ?? 20),
    clockMode: input.ruleValues.CLOCK_MODE === "STOPPAGE" ? ("STOPPAGE" as const) : ("RUNNING" as const),
    fourPointEnabled: input.ruleValues.FOUR_POINT_ENABLED !== false,
    ultraTimeEnabled: input.ruleValues.ULTRA_TIME_ENABLED !== false,
  };

  const existing = await loadSeasonRuleSet(tx, input.organizationId, input.seasonId, input.sportId);
  if (existing) {
    return tx.ruleSet.update({
      where: { id: existing.id },
      data: { name: input.name, config: { rules: input.ruleValues }, ...structure, isActive: true },
    });
  }
  return tx.ruleSet.create({
    data: {
      organizationId: input.organizationId,
      seasonId: input.seasonId,
      sportId: input.sportId,
      name: input.name,
      config: { rules: input.ruleValues },
      ...structure,
      isActive: true,
    },
  });
}
