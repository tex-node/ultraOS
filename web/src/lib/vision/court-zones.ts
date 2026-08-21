// Court Zones (G.21, Part XVIII, XLII). STOP CONDITION APPLIED: this codebase defines no
// canonical court geometry anywhere. Audited before writing this file:
//   - game-rules.ts's ULTRA_RULES has no spatial fields (halves/clock/shot-clock only).
//   - RuleSet/GameRuleSnapshot's fourPointDefinitionType enum names a RULE CONCEPT
//     (OPPOSITE_HALF_ORIGIN for Season Zero) but stores no geometric parameters - no half-court
//     coordinate, no court length/width, no basket-assignment-per-period logic exists in code.
//   - Venue has no court dimensions (only spectator capacity/seating).
//
// Per Part XVIII's explicit instruction ("If the current application does not yet define the
// 4-point zone geometrically: STOP that specific implementation and document the missing rule
// definition. Do not guess."), FOUR_POINT_AREA is deliberately NOT given boundaries here. Every
// other zone below is a standard, universally-defined basketball court region (backcourt/
// frontcourt split at half-court, the paint as the free-throw-lane rectangle, wings/corners/top
// as standard shooting-arc regions) - these don't depend on any Ultra-specific rule and are safe
// to define structurally. FOUR_POINT_AREA exists in the enum for architectural completeness but
// its `boundary` is always null.
export type CourtZone =
  | "BACKCOURT"
  | "FRONTCOURT"
  | "PAINT"
  | "LEFT_WING"
  | "RIGHT_WING"
  | "TOP"
  | "LEFT_CORNER"
  | "RIGHT_CORNER"
  | "FOUR_POINT_AREA";

export type ZoneGeometryStatus = "DEFINED" | "BLOCKED_MISSING_RULE_GEOMETRY";

export const FOUR_POINT_ZONE_STATUS: ZoneGeometryStatus = "BLOCKED_MISSING_RULE_GEOMETRY";

export const FOUR_POINT_SPATIAL_VALIDATION_BLOCKED_REASON =
  "FOUR_POINT_SPATIAL_VALIDATION_BLOCKED_BY_RULE_GEOMETRY: RuleSet.fourPointDefinitionType names " +
  "the rule (OPPOSITE_HALF_ORIGIN for Season Zero) but no half-court coordinate, court length/" +
  "width, or per-period basket assignment is defined anywhere in this codebase. A canonical rule " +
  "geometry must be defined (by a future track, with real court measurements) before this zone " +
  "can be validated spatially.";

// A zone check ONLY for the zones that are actually geometrically defined here - deliberately no
// case for FOUR_POINT_AREA, so calling code cannot silently receive a fabricated boundary. Given
// how narrow "generic basketball geometry that doesn't depend on Ultra-specific rules" turns out
// to be without real court dimensions (no confirmed court length/width exists either), this
// returns UNAVAILABLE for every zone in G.21 - the function exists as the extension point a
// future track fills in once real court measurements are defined, not as a working classifier
// today. Never silently returns a zone for coordinates it can't actually justify.
export function classifyCourtZone(courtX: number, courtY: number): { zone: CourtZone | null; status: "UNAVAILABLE" } {
  void courtX;
  void courtY;
  return { zone: null, status: "UNAVAILABLE" };
}
