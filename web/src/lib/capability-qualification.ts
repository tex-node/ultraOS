// Deterministic capability qualification (G.16, Part XXIII). `startGame()` (games/actions.ts,
// Track H) already stamps a native game `ULTRA_NATIVE_EVENTS` the moment it starts through the
// live scorer - every SCORE event that console ever writes always carries real (non-null)
// basePointValue/multiplier/isUltraTime provenance, so that assignment was never actually
// speculative. This module documents, as a checkable predicate, exactly what "complete Ultra
// provenance" means - so a future caller (verification, an audit script, a future capability
// reclassification pass) can confirm a game's stamped capability is actually earned, rather than
// trusting the write-time assignment on faith. It does not itself change Game.dataCapability -
// see the exact criteria and reasoning in LIVE_DATA_CAPABILITY_V2.md.
export type CapabilityQualificationInput = {
  eventType: string;
  basePointValue: number | null;
  multiplier: number | null;
  isUltraTime: boolean;
};

// EVENT_LEVEL: a real chronological event ledger exists for this game (at least one event was
// captured) - satisfied by definition once any statistician or scorer event exists.
export function qualifiesForEventLevel(events: CapabilityQualificationInput[]): boolean {
  return events.length > 0;
}

// FULL_ULTRA: every scoring event (SHOT_MADE/SHOT_MISSED/FREE_THROW_MADE/FREE_THROW_MISSED/
// SCORE) in the ledger carries complete Ultra provenance - a real basePointValue and a real
// multiplier, never null/undefined for a scoring event. A game can genuinely qualify even if
// Ultra Time or a 4PT shot never actually occurred in it (the rules still applied and were
// evaluated on every shot; "capability" is about what the system captured, not what happened to
// occur) - but a single scoring event missing its provenance fields means the game's capability
// claim cannot be verified, and this predicate returns false rather than assuming it anyway.
export function qualifiesForFullUltra(events: CapabilityQualificationInput[]): boolean {
  const scoringEventTypes = new Set(["SCORE", "SCORE_CORRECTION", "SHOT_MADE", "SHOT_MISSED", "FREE_THROW_MADE", "FREE_THROW_MISSED"]);
  const scoringEvents = events.filter((e) => scoringEventTypes.has(e.eventType));
  if (scoringEvents.length === 0) return false;
  return scoringEvents.every((e) => e.basePointValue !== null && e.multiplier !== null);
}
