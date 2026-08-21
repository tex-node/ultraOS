// 4PT Spatial Rule (G.22, Part VI, XLVII-XLVIII). Pure - translates the existing rule CONCEPT
// (RuleSet.fourPointDefinitionType) into a real geometric evaluation, but ONLY once official
// court geometry actually exists (CourtSpecification.status === "OFFICIAL" with the needed
// fields populated). Never invents a boundary - see COURT_CALIBRATION.md / FOUR_POINT_SPATIAL_RULE.md
// for why no Ultra court geometry is defined anywhere in this codebase as of G.22.
import type { CourtBasketSide, FourPointDefinitionType } from "@/generated/prisma/enums";

export type FourPointSpatialResult = "QUALIFIES" | "DOES_NOT_QUALIFY" | "BOUNDARY_UNCERTAIN" | "GEOMETRY_UNAVAILABLE";

export type MinimalCourtSpec = {
  status: "DRAFT" | "OFFICIAL";
  halfCourtX: number | null;
  // Reserved for a future DESIGNATED_ZONE geometry (an explicit polygon) - not evaluated by this
  // function today because no RuleSet in this codebase uses DESIGNATED_ZONE, and no polygon
  // geometry has ever been entered for one. Kept in the input shape so the function's contract
  // doesn't need to change when that becomes real.
  fourPointGeometry: unknown;
};

export function evaluateFourPointSpatialQualification(input: {
  shooterCourtX: number;
  attackingBasket: CourtBasketSide;
  ruleType: FourPointDefinitionType;
  courtSpec: MinimalCourtSpec | null;
  // The positional uncertainty (in the same units as courtX) around the shooter's estimated
  // position - typically the calibration's reprojection error. A shot whose estimated position
  // is within this margin of the boundary is BOUNDARY_UNCERTAIN, never forced to a binary
  // QUALIFIES/DOES_NOT_QUALIFY (Part XLVIII: "do not make a binary claim if positional error
  // overlaps the line").
  positionalUncertaintyUnits: number;
}): FourPointSpatialResult {
  if (input.ruleType === "DISABLED") return "DOES_NOT_QUALIFY";

  if (input.ruleType === "DESIGNATED_ZONE") {
    // No designated-zone geometry has ever been entered anywhere in this codebase (Season Zero
    // uses OPPOSITE_HALF_ORIGIN) - never fabricate a polygon evaluation.
    return "GEOMETRY_UNAVAILABLE";
  }

  // OPPOSITE_HALF_ORIGIN
  if (!input.courtSpec || input.courtSpec.status !== "OFFICIAL" || input.courtSpec.halfCourtX === null) {
    return "GEOMETRY_UNAVAILABLE";
  }

  const halfCourtX = input.courtSpec.halfCourtX;
  const distanceFromHalfCourt = input.shooterCourtX - halfCourtX;
  // "Opposite half from the shooter's own basket" - qualifying means the shooter is on the
  // OTHER side of half-court from the basket they're attacking.
  const opposingSideSign = input.attackingBasket === "A" ? 1 : -1; // if attacking A (assumed at negative X), qualifying half is positive X, and vice versa - see documentation for the sign convention
  const signedDistance = distanceFromHalfCourt * opposingSideSign;

  if (Math.abs(signedDistance) <= input.positionalUncertaintyUnits) return "BOUNDARY_UNCERTAIN";
  return signedDistance > 0 ? "QUALIFIES" : "DOES_NOT_QUALIFY";
}
