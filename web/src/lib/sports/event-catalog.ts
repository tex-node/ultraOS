// Multi-sport Stage 6 (S6.1/S6.2): event vocabulary mapping. Pure functions only; no database
// access. The sport definition's events catalog is the authority; a legacy GameEventType is mapped
// to its catalog key so existing Season Zero events resolve against the same catalog the scorer
// console renders from.

import type { SportDefinition, SportEventDefinition } from "./types";

// Legacy GameEventType values whose catalog key differs. SCORE was emitted by the original scorer
// for a made shot; everything with an identical name maps to itself.
export const LEGACY_EVENT_KEY_REMAP: Record<string, string> = {
  SCORE: "SHOT_MADE",
};

export function legacyEventTypeToKey(legacyType: string): string {
  return LEGACY_EVENT_KEY_REMAP[legacyType] ?? legacyType;
}

export function eventDefinitionFor(
  definition: SportDefinition,
  typeKey: string | null | undefined,
): SportEventDefinition | undefined {
  if (!typeKey) return undefined;
  return definition.events.find((event) => event.key === typeKey);
}

export function eventScores(definition: SportDefinition, typeKey: string | null | undefined): boolean {
  return eventDefinitionFor(definition, typeKey)?.scores === true;
}

export function eventPointValues(definition: SportDefinition, typeKey: string | null | undefined): number[] {
  return eventDefinitionFor(definition, typeKey)?.pointValues ?? [];
}

export function eventCatalog(definition: SportDefinition): SportEventDefinition[] {
  return definition.events;
}

export function eventCatalogCategory(definition: SportDefinition, category: string): SportEventDefinition[] {
  return definition.events.filter((event) => event.category === category);
}
