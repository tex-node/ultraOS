// Validator registry for sport constraints. See documentation/architecture/MULTI_SPORT_ARCHITECTURE.md,
// Section 5.11. A sport definition references validator keys (SportConstraint.key); the code here
// implements them. The engine validates that an event's type exists and its actors are eligible,
// but the sport's meaning lives in these validators, not in the engine.

import type { ConstraintContext, SportConstraint, SportDefinition } from "./types";

export type ValidationOutcome = { ok: true } | { ok: false; issue: string };

export type SportValidationInput = {
  definition: SportDefinition;
  event?: {
    typeKey?: string;
    // Whether a player or entrant is attached to the event.
    hasActor?: boolean;
  };
  player?: {
    isActive?: boolean;
    fouls?: number;
    yellowCards?: number;
    redCard?: boolean;
  };
  lineup?: {
    rotationOrder?: string[];
    expectedRotationOrder?: string[];
    substitutionsUsed?: number;
    substitutionsAllowed?: number;
  };
};

export type SportValidator = (input: SportValidationInput) => ValidationOutcome;

const OK: ValidationOutcome = { ok: true };

export const SPORT_VALIDATORS: Record<string, SportValidator> = {
  SCORING_EVENT_REQUIRES_ACTOR: ({ definition, event }) => {
    if (!event?.typeKey) return OK;
    const eventDefinition = definition.events.find((candidate) => candidate.key === event.typeKey);
    if (eventDefinition?.scores && event.hasActor === false) {
      return { ok: false, issue: `Scoring event "${event.typeKey}" requires a player or entrant.` };
    }
    return OK;
  },
  BASKETBALL_ACTIVE_PLAYER_REQUIRED: ({ event, player }) => {
    if (!event?.typeKey || !player) return OK;
    if (player.isActive === false) {
      return { ok: false, issue: "Only active players may record events." };
    }
    return OK;
  },
  BASKETBALL_PLAYER_FOUL_LIMIT: ({ player }) => {
    if (!player) return OK;
    const limit = 5;
    if (player.isActive !== false && typeof player.fouls === "number" && player.fouls >= limit) {
      return { ok: false, issue: `A player with ${limit} fouls may not return to play.` };
    }
    return OK;
  },
  FOOTBALL_SENT_OFF_PLAYER: ({ player }) => {
    if (player?.redCard === true) {
      return { ok: false, issue: "A sent-off player may not take further part." };
    }
    return OK;
  },
  VOLLEYBALL_ROTATION_ORDER: ({ lineup }) => {
    if (!lineup?.rotationOrder || !lineup.expectedRotationOrder) return OK;
    if (lineup.rotationOrder.join(",") !== lineup.expectedRotationOrder.join(",")) {
      return { ok: false, issue: "Service rotation order is out of sequence." };
    }
    return OK;
  },
  VOLLEYBALL_MAX_SUBSTITUTIONS: ({ lineup }) => {
    if (lineup?.substitutionsUsed === undefined || lineup?.substitutionsAllowed === undefined) return OK;
    if (lineup.substitutionsUsed >= lineup.substitutionsAllowed) {
      return { ok: false, issue: "Substitution limit reached." };
    }
    return OK;
  },
};

export function getSportValidator(key: string): SportValidator | null {
  return Object.prototype.hasOwnProperty.call(SPORT_VALIDATORS, key) ? SPORT_VALIDATORS[key] : null;
}

export function isKnownValidator(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPORT_VALIDATORS, key);
}

export type ConstraintResult = {
  constraint: SportConstraint;
  ok: boolean;
  issue?: string;
  blocks: boolean;
};

// Runs every constraint declared for a context. `input` carries the facts a validator may need;
// validators guard on the fields they require, so passing a partial input is safe.
export function runConstraints(
  definition: SportDefinition,
  context: ConstraintContext,
  input: Omit<SportValidationInput, "definition"> = {},
): ConstraintResult[] {
  return definition.constraints
    .filter((constraint) => constraint.context === context)
    .map((constraint) => {
      const validator = getSportValidator(constraint.key);
      if (!validator) {
        return {
          constraint,
          ok: false,
          issue: `No validator registered for "${constraint.key}".`,
          blocks: constraint.severity === "BLOCK",
        };
      }
      const outcome = validator({ definition, ...input });
      return {
        constraint,
        ok: outcome.ok,
        issue: outcome.ok ? undefined : outcome.issue,
        blocks: !outcome.ok && constraint.severity === "BLOCK",
      };
    });
}

export function hasBlockingIssue(results: ConstraintResult[]): boolean {
  return results.some((result) => result.blocks);
}
