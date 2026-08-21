// Attacking Direction (G.22, Part VIII). Pure - no Prisma. Which basket a team attacks in a
// given period, derived from ONE explicit, operator-set value (`Game.homeAttacksBasketFirstHalf`
// - never guessed) plus the standard basketball convention that teams switch baskets at
// halftime. That convention is a genuine assumption, made explicit here rather than silently
// baked into a default - if Ultra Basketball ever plays a format where this doesn't hold (no
// side switch, or a different switch pattern for overtime), this function's own documentation is
// the place that assumption would need revisiting.
import type { CourtBasketSide } from "@/generated/prisma/enums";

export type AttackingDirectionResult =
  | { status: "KNOWN"; homeAttacks: CourtBasketSide; awayAttacks: CourtBasketSide }
  | { status: "UNAVAILABLE" };

// `finalPeriod` mirrors game-rules.ts's ULTRA_RULES.halves (2 for Season Zero) - passed in
// rather than imported, so this module has zero dependency on game-rules.ts's specific values
// and stays correct if the format ever changes.
export function attackingBasketForPeriod(
  homeAttacksBasketFirstHalf: CourtBasketSide | null,
  period: number,
  finalPeriod: number,
): AttackingDirectionResult {
  if (homeAttacksBasketFirstHalf === null) return { status: "UNAVAILABLE" };

  const other: CourtBasketSide = homeAttacksBasketFirstHalf === "A" ? "B" : "A";
  // Standard switch-at-halftime: periods 1..finalPeriod alternate starting from the recorded
  // first-half value. Overtime (period > finalPeriod) is treated as a continuation of the
  // finalPeriod side (not a further switch) - overtime sides are conventionally re-decided by
  // coin toss or continue from the second half in most amateur formats, and nothing in this
  // codebase captures an OT-specific side assignment; documented as the assumption it is, not
  // hidden.
  const effectivePeriod = Math.min(period, finalPeriod);
  const homeAttacks = effectivePeriod % 2 === 1 ? homeAttacksBasketFirstHalf : other;
  const awayAttacks = homeAttacks === "A" ? "B" : "A";
  return { status: "KNOWN", homeAttacks, awayAttacks };
}
