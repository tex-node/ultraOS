import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFourPointSpatialQualification } from "./four-point-spatial-rule";

const officialSpec = { status: "OFFICIAL" as const, halfCourtX: 0, fourPointGeometry: null };
const draftSpec = { status: "DRAFT" as const, halfCourtX: 0, fourPointGeometry: null };

test("evaluateFourPointSpatialQualification: DISABLED always returns DOES_NOT_QUALIFY regardless of geometry", () => {
  const result = evaluateFourPointSpatialQualification({ shooterCourtX: 10, attackingBasket: "A", ruleType: "DISABLED", courtSpec: null, positionalUncertaintyUnits: 0.1 });
  assert.equal(result, "DOES_NOT_QUALIFY");
});

test("evaluateFourPointSpatialQualification: DESIGNATED_ZONE is always GEOMETRY_UNAVAILABLE (no polygon geometry exists anywhere)", () => {
  const result = evaluateFourPointSpatialQualification({ shooterCourtX: 10, attackingBasket: "A", ruleType: "DESIGNATED_ZONE", courtSpec: officialSpec, positionalUncertaintyUnits: 0.1 });
  assert.equal(result, "GEOMETRY_UNAVAILABLE");
});

test("evaluateFourPointSpatialQualification: OPPOSITE_HALF_ORIGIN with no court spec is GEOMETRY_UNAVAILABLE", () => {
  const result = evaluateFourPointSpatialQualification({ shooterCourtX: 10, attackingBasket: "A", ruleType: "OPPOSITE_HALF_ORIGIN", courtSpec: null, positionalUncertaintyUnits: 0.1 });
  assert.equal(result, "GEOMETRY_UNAVAILABLE");
});

test("evaluateFourPointSpatialQualification: a DRAFT (unconfirmed) court spec is GEOMETRY_UNAVAILABLE, never treated as official", () => {
  const result = evaluateFourPointSpatialQualification({ shooterCourtX: 10, attackingBasket: "A", ruleType: "OPPOSITE_HALF_ORIGIN", courtSpec: draftSpec, positionalUncertaintyUnits: 0.1 });
  assert.equal(result, "GEOMETRY_UNAVAILABLE");
});

test("evaluateFourPointSpatialQualification: a shooter clearly on the opposite half from their basket QUALIFIES", () => {
  const result = evaluateFourPointSpatialQualification({ shooterCourtX: 10, attackingBasket: "A", ruleType: "OPPOSITE_HALF_ORIGIN", courtSpec: officialSpec, positionalUncertaintyUnits: 0.1 });
  assert.equal(result, "QUALIFIES");
});

test("evaluateFourPointSpatialQualification: a shooter clearly on their own half DOES_NOT_QUALIFY", () => {
  const result = evaluateFourPointSpatialQualification({ shooterCourtX: -10, attackingBasket: "A", ruleType: "OPPOSITE_HALF_ORIGIN", courtSpec: officialSpec, positionalUncertaintyUnits: 0.1 });
  assert.equal(result, "DOES_NOT_QUALIFY");
});

test("evaluateFourPointSpatialQualification: attacking the other basket flips which side qualifies", () => {
  const qualifies = evaluateFourPointSpatialQualification({ shooterCourtX: -10, attackingBasket: "B", ruleType: "OPPOSITE_HALF_ORIGIN", courtSpec: officialSpec, positionalUncertaintyUnits: 0.1 });
  assert.equal(qualifies, "QUALIFIES");
});

test("evaluateFourPointSpatialQualification: a position within the uncertainty margin of half-court is BOUNDARY_UNCERTAIN, never a forced binary claim", () => {
  const result = evaluateFourPointSpatialQualification({ shooterCourtX: 0.05, attackingBasket: "A", ruleType: "OPPOSITE_HALF_ORIGIN", courtSpec: officialSpec, positionalUncertaintyUnits: 0.5 });
  assert.equal(result, "BOUNDARY_UNCERTAIN");
});
