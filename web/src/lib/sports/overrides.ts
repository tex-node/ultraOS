// Organization-level customization of a sport definition. The code registry is the authority
// (documentation/architecture/MULTI_SPORT_ARCHITECTURE.md, decision D3); a stored override only
// replaces declared rule values, default divisions, and (2026-09-22) a WIN_DRAW_LOSS standings
// model's win/draw/loss point values, and is validated against the definition before it is
// applied. `standingsPoints` was added when the Lagos Basketball Community League's own official
// standings turned out to use a real 2-points-win/1-point-loss convention, different from the
// platform's 3-win/0-loss basketball default - a real per-league scoring rule, not a bug, and one
// organization's choice must never change another's. Everything else (structure, events,
// metrics, the rest of standings, capabilities) is deliberately not overridable yet - changing
// those needs a new definition version, not an ad-hoc tenant tweak.

import { z } from "zod";
import type { SportDefinition, SportRuleValue } from "./types";

const standingsPointsSchema = z.object({
  win: z.number(),
  draw: z.number().optional(),
  loss: z.number(),
  noResult: z.number().optional(),
});

export const sportOverrideSchema = z.object({
  rules: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  defaultDivisions: z.array(z.string().trim().min(1)).optional(),
  standingsPoints: standingsPointsSchema.optional(),
});

export type SportOverrideConfig = z.infer<typeof sportOverrideSchema>;

export class SportOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportOverrideError";
  }
}

export function parseSportOverride(value: unknown): SportOverrideConfig {
  const result = sportOverrideSchema.safeParse(value ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new SportOverrideError(
      `Invalid sport override: ${first?.path.join(".") ?? "unknown"} ${first?.message ?? ""}`.trim(),
    );
  }
  return result.data;
}

export function validateSportOverride(definition: SportDefinition, config: SportOverrideConfig): string[] {
  const issues: string[] = [];
  const declared = new Map((definition.rules ?? []).map((rule) => [rule.key, rule.value]));
  for (const [key, value] of Object.entries(config.rules ?? {})) {
    if (!declared.has(key)) {
      issues.push(`Unknown rule "${key}" for ${definition.name}.`);
      continue;
    }
    const declaredValue = declared.get(key);
    if (typeof declaredValue !== typeof value) {
      issues.push(`Rule "${key}" must be a ${typeof declaredValue}.`);
    }
  }
  if (config.standingsPoints && definition.standings.primaryPoints.model !== "WIN_DRAW_LOSS") {
    issues.push(`standingsPoints override only applies to a WIN_DRAW_LOSS standings model, not ${definition.standings.primaryPoints.model}.`);
  }
  return issues;
}

export function applySportOverride(definition: SportDefinition, config: SportOverrideConfig): SportDefinition {
  const overrides = config.rules ?? {};
  const rules: SportRuleValue[] | undefined = definition.rules
    ? definition.rules.map((rule) =>
        Object.prototype.hasOwnProperty.call(overrides, rule.key) ? { ...rule, value: overrides[rule.key] } : rule,
      )
    : undefined;

  const primaryPoints =
    config.standingsPoints && definition.standings.primaryPoints.model === "WIN_DRAW_LOSS"
      ? { ...definition.standings.primaryPoints, ...config.standingsPoints }
      : definition.standings.primaryPoints;

  return {
    ...definition,
    rules,
    defaultDivisions: config.defaultDivisions ?? definition.defaultDivisions,
    standings: { ...definition.standings, primaryPoints },
  };
}
