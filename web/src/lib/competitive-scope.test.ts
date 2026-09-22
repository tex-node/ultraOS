import assert from "node:assert/strict";
import test from "node:test";
import { competitiveFixtureScope, COMPETITIVE_FIXTURE_RECORD_ORIGINS, isCompetitiveFixture } from "./competitive-scope";

test("isCompetitiveFixture accepts PRODUCTION-origin fixtures", () => {
  assert.equal(isCompetitiveFixture({ recordOrigin: "PRODUCTION" }), true);
});

test("isCompetitiveFixture accepts IMPORT-origin fixtures (real games transcribed from an external box score, e.g. LBCL)", () => {
  assert.equal(isCompetitiveFixture({ recordOrigin: "IMPORT" }), true);
});

test("isCompetitiveFixture rejects a REHEARSAL-origin fixture, even if FINAL", () => {
  assert.equal(isCompetitiveFixture({ recordOrigin: "REHEARSAL" }), false);
});

test("isCompetitiveFixture rejects every other non-allow-listed origin (fail-safe allow-list, not a REHEARSAL-only deny-list)", () => {
  for (const origin of ["SYSTEM", "DEMO", "APPLICATION", "ADMIN", "ADMIN_OFFLINE_INTAKE"]) {
    assert.equal(isCompetitiveFixture({ recordOrigin: origin }), false, `${origin} must not be treated as competitive`);
  }
});

test("competitiveFixtureScope's Prisma fragment matches isCompetitiveFixture's own decision exactly", () => {
  const scope = competitiveFixtureScope();
  assert.deepEqual(scope, { recordOrigin: { in: COMPETITIVE_FIXTURE_RECORD_ORIGINS } });
  for (const origin of COMPETITIVE_FIXTURE_RECORD_ORIGINS) {
    assert.equal(isCompetitiveFixture({ recordOrigin: origin }), true);
  }
});
