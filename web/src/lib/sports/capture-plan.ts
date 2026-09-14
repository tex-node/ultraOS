// Multi-sport Stage 8 (S6.3 groundwork): a catalog-driven capture plan.
//
// Produces the actions a scorer console should render, grouped by the sport definition's event
// categories, so the console can be built from the catalog instead of hardcoded per sport. Pure
// functions only; no database access.

import type { SportDefinition, SportEventDefinition } from "./types";

export type CaptureAction = {
  key: string;
  label: string;
  category: string;
  scores: boolean;
  pointValues: number[];
};

export type CaptureCategoryPlan = {
  category: string;
  actions: CaptureAction[];
};

function toAction(event: SportEventDefinition): CaptureAction {
  return {
    key: event.key,
    label: event.label,
    category: event.category,
    scores: event.scores === true,
    pointValues: event.pointValues ?? [],
  };
}

// Category order follows first appearance in the definition, so the console layout is stable and
// sport-authored.
export function capturePlan(definition: SportDefinition): CaptureCategoryPlan[] {
  const order: string[] = [];
  const byCategory = new Map<string, CaptureAction[]>();
  for (const event of definition.events) {
    if (!byCategory.has(event.category)) {
      byCategory.set(event.category, []);
      order.push(event.category);
    }
    byCategory.get(event.category)!.push(toAction(event));
  }
  return order.map((category) => ({ category, actions: byCategory.get(category)! }));
}

export function scoringActions(definition: SportDefinition): CaptureAction[] {
  return definition.events.filter((event) => event.scores === true).map(toAction);
}

export function captureActionFor(definition: SportDefinition, key: string): CaptureAction | undefined {
  const event = definition.events.find((candidate) => candidate.key === key);
  return event ? toAction(event) : undefined;
}
