import assert from "node:assert/strict";
import test from "node:test";
import { competitiveFixtureScope, COMPETITIVE_FIXTURE_RECORD_ORIGIN, isCompetitiveFixture } from "./competitive-scope";

test("isCompetitiveFixture accepts only PRODUCTION-origin fixtures", () => {
  assert.equal(isCompetitiveFixture({ recordOrigin: "PRODUCTION" }), true);
});

test("isCompetitiveFixture rejects a REHEARSAL-origin fixture, even if FINAL", () => {
  assert.equal(isCompetitiveFixture({ recordOrigin: "REHEARSAL" }), false);
});

test("isCompetitiveFixture rejects every other non-PRODUCTION origin (fail-safe allow-list, not a REHEARSAL-only deny-list)", () => {
  for (const origin of ["SYSTEM", "DEMO", "IMPORT", "APPLICATION", "ADMIN", "ADMIN_OFFLINE_INTAKE"]) {
    assert.equal(isCompetitiveFixture({ recordOrigin: origin }), false, `${origin} must not be treated as competitive`);
  }
});

test("competitiveFixtureScope's Prisma fragment matches isCompetitiveFixture's own decision exactly", () => {
  const scope = competitiveFixtureScope();
  assert.deepEqual(scope, { recordOrigin: COMPETITIVE_FIXTURE_RECORD_ORIGIN });
  assert.equal(isCompetitiveFixture({ recordOrigin: scope.recordOrigin }), true);
});
