import assert from "node:assert/strict";
import test from "node:test";
import { productionPresentationFixtureWhere, isProductionPresentationFixture } from "./presentation-scope";

test("productionPresentationFixtureWhere is an allow-list of exactly PRODUCTION", () => {
  assert.deepEqual(productionPresentationFixtureWhere(), { recordOrigin: "PRODUCTION" });
});

test("isProductionPresentationFixture accepts PRODUCTION and rejects every other RecordOrigin", () => {
  assert.equal(isProductionPresentationFixture({ recordOrigin: "PRODUCTION" }), true);
  for (const origin of ["REHEARSAL", "DEMO", "SYSTEM", "IMPORT", "APPLICATION", "ADMIN", "ADMIN_OFFLINE_INTAKE"]) {
    assert.equal(isProductionPresentationFixture({ recordOrigin: origin }), false, `${origin} must not be presentation-visible`);
  }
});
