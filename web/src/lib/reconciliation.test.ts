import assert from "node:assert/strict";
import test from "node:test";
import { reconcileGameScore } from "./reconciliation";

test("reconcileGameScore reports UNAVAILABLE for both teams before the statistician records anything", () => {
  const result = reconcileGameScore(12, 8, 0, 0, false);
  assert.equal(result.overallStatus, "UNAVAILABLE");
  assert.equal(result.home.status, "UNAVAILABLE");
  assert.equal(result.away.status, "UNAVAILABLE");
});

test("reconcileGameScore reports MATCHED when official and statistical scores agree for both teams", () => {
  const result = reconcileGameScore(26, 24, 26, 24, true);
  assert.equal(result.overallStatus, "MATCHED");
  assert.deepEqual(result.home, { officialScore: 26, statisticalScore: 26, difference: 0, status: "MATCHED" });
  assert.deepEqual(result.away, { officialScore: 24, statisticalScore: 24, difference: 0, status: "MATCHED" });
});

test("reconcileGameScore reports MISMATCH with the correct signed difference when one team disagrees", () => {
  const result = reconcileGameScore(26, 24, 24, 24, true);
  assert.equal(result.overallStatus, "MISMATCH");
  assert.equal(result.home.status, "MISMATCH");
  assert.equal(result.home.difference, 2);
  assert.equal(result.away.status, "MATCHED");
});

test("reconcileGameScore does not treat a legitimate 0-0 statistical tally as UNAVAILABLE once the statistician has started", () => {
  const result = reconcileGameScore(0, 0, 0, 0, true);
  assert.equal(result.overallStatus, "MATCHED");
  assert.equal(result.home.status, "MATCHED");
  assert.equal(result.away.status, "MATCHED");
});

test("reconcileGameScore treats a negative difference (statistical score higher than official) as MISMATCH, not silently corrected", () => {
  const result = reconcileGameScore(20, 10, 22, 10, true);
  assert.equal(result.home.status, "MISMATCH");
  assert.equal(result.home.difference, -2);
  assert.equal(result.overallStatus, "MISMATCH");
});
