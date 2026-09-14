// Organization-level customization of a sport definition. The code registry is the authority
// (documentation/architecture/MULTI_SPORT_ARCHITECTURE.md, decision D3); a stored override only
// replaces declared rule values and default divisions, and is validated against the definition
// before it is applied. Everything else (structure, events, metrics, standings, capabilities) is
// deliberately not overridable yet - changing those needs a new definition version, not an ad-hoc
// tenant tweak.

import { z } from "zod";
import type { SportDefinition, SportRuleValue } from "./types";

export const sportOverrideSchema = z.object({
  rules: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  defaultDivisions: z.array(z.string().trim().min(1)).optional(),
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
  return issues;
}

export function applySportOverride(definition: SportDefinition, config: SportOverrideConfig): SportDefinition {
  const overrides = config.rules ?? {};
  const rules: SportRuleValue[] | undefined = definition.rules
    ? definition.rules.map((rule) =>
        Object.prototype.hasOwnProperty.call(overrides, rule.key) ? { ...rule, value: overrides[rule.key] } : rule,
      )
    : undefined;

  return {
    ...definition,
    rules,
    defaultDivisions: config.defaultDivisions ?? definition.defaultDivisions,
  };
}
