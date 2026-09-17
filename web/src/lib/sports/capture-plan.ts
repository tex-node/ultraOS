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

// The catalog panel captures non-scoring events only when the scoreline is owned by a dedicated
// scorer (basketball's recordScore, or another sport's scoring module). Otherwise a "Goal" button
// would store a note that does not count, duplicating the real scoring control.
export function nonScoringCapturePlan(
  definition: SportDefinition,
  options: { scoringHandledElsewhere: boolean },
): CaptureCategoryPlan[] {
  const plan = capturePlan(definition);
  if (!options.scoringHandledElsewhere) return plan;
  return plan
    .map((group) => ({ ...group, actions: group.actions.filter((action) => !action.scores) }))
    .filter((group) => group.actions.length > 0);
}

export function captureActionFor(definition: SportDefinition, key: string): CaptureAction | undefined {
  const event = definition.events.find((candidate) => candidate.key === key);
  return event ? toAction(event) : undefined;
}
