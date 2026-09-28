// Pure builder for the VOIDED status-flip fields, shared by voidGameEvent and voidScoreEvent -
// both set the identical four fields, and this is the one place that shape lives. `now` is a
// parameter (defaulting to the real clock) rather than an internal `new Date()` call so the
// function stays deterministic and testable. voidScoreEvent does NOT delegate to voidGameEvent to
// get this: voidGameEvent loads the event under its own preconditions, voidScoreEvent needs the
// event's details for delta computation and an additional eventType check - delegating would mean
// a double-load or a `preloaded?` escape hatch, both worse than each service calling this directly.
export function buildVoidData(reason: string, actorId: string, now: Date = new Date()) {
  return {
    status: "VOIDED" as const,
    correctedAt: now,
    correctedById: actorId,
    correctionReason: reason,
  };
}
