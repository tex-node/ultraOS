import assert from "node:assert/strict";
import test from "node:test";
import { computeFreshness, computeSnapshotHealth, computeReconciliationHealth, computePresentationHealth, combineStatuses } from "./system-health";

test("computeFreshness buckets correctly at the boundaries", () => {
  assert.equal(computeFreshness(30, 30, 120), "FRESH");
  assert.equal(computeFreshness(31, 30, 120), "DELAYED");
  assert.equal(computeFreshness(120, 30, 120), "DELAYED");
  assert.equal(computeFreshness(121, 30, 120), "STALE");
});

test("computeSnapshotHealth reports NOT_APPLICABLE (not stale) when the game isn't actually expected to be producing updates", () => {
  const paused = computeSnapshotHealth({ gameStatus: "LIVE", clockRunning: false, lastEventAt: new Date(Date.now() - 10 * 60_000), nowMs: Date.now() });
  assert.equal(paused.freshness, "NOT_APPLICABLE");
  assert.equal(paused.status, "HEALTHY");

  const final = computeSnapshotHealth({ gameStatus: "FINAL", clockRunning: false, lastEventAt: new Date(Date.now() - 60 * 60_000), nowMs: Date.now() });
  assert.equal(final.freshness, "NOT_APPLICABLE");
});

test("computeSnapshotHealth escalates FRESH -> WARNING -> CRITICAL only while the clock is genuinely running", () => {
  const now = Date.now();
  const fresh = computeSnapshotHealth({ gameStatus: "LIVE", clockRunning: true, lastEventAt: new Date(now - 10_000), nowMs: now });
  assert.equal(fresh.status, "HEALTHY");
  const delayed = computeSnapshotHealth({ gameStatus: "LIVE", clockRunning: true, lastEventAt: new Date(now - 60_000), nowMs: now });
  assert.equal(delayed.status, "WARNING");
  const stale = computeSnapshotHealth({ gameStatus: "LIVE", clockRunning: true, lastEventAt: new Date(now - 200_000), nowMs: now });
  assert.equal(stale.status, "CRITICAL");
});

test("computeSnapshotHealth warns (not crashes) when LIVE with the clock running but zero events ever recorded", () => {
  const result = computeSnapshotHealth({ gameStatus: "LIVE", clockRunning: true, lastEventAt: null, nowMs: Date.now() });
  assert.equal(result.status, "WARNING");
});

test("computeReconciliationHealth: UNAVAILABLE is UNKNOWN, not a false HEALTHY or false alarm", () => {
  assert.equal(computeReconciliationHealth({ overallStatus: "UNAVAILABLE", isFinal: false }).status, "UNKNOWN");
});

test("computeReconciliationHealth: MATCHED is always HEALTHY", () => {
  assert.equal(computeReconciliationHealth({ overallStatus: "MATCHED", isFinal: false }).status, "HEALTHY");
  assert.equal(computeReconciliationHealth({ overallStatus: "MATCHED", isFinal: true }).status, "HEALTHY");
});

test("computeReconciliationHealth: MISMATCH is WARNING while live, CRITICAL once FINAL (unresolved is worse)", () => {
  assert.equal(computeReconciliationHealth({ overallStatus: "MISMATCH", isFinal: false }).status, "WARNING");
  assert.equal(computeReconciliationHealth({ overallStatus: "MISMATCH", isFinal: true }).status, "CRITICAL");
});

test("computePresentationHealth: empty Program is HEALTHY", () => {
  const result = computePresentationHealth({ hasProgram: false, programFixtureExists: false, programFixtureIsProduction: false, programAgeSeconds: null });
  assert.equal(result.status, "HEALTHY");
});

test("computePresentationHealth: a Program pointing at a deleted fixture is CRITICAL, not a crash", () => {
  const result = computePresentationHealth({ hasProgram: true, programFixtureExists: false, programFixtureIsProduction: false, programAgeSeconds: 10 });
  assert.equal(result.status, "CRITICAL");
});

test("computePresentationHealth: a Program pointing at a REHEARSAL fixture in normal operation is CRITICAL", () => {
  const result = computePresentationHealth({ hasProgram: true, programFixtureExists: true, programFixtureIsProduction: false, programAgeSeconds: 10 });
  assert.equal(result.status, "CRITICAL");
});

test("computePresentationHealth: a long-standing valid Program is still HEALTHY (age alone is not unhealthy)", () => {
  const result = computePresentationHealth({ hasProgram: true, programFixtureExists: true, programFixtureIsProduction: true, programAgeSeconds: 3600 });
  assert.equal(result.status, "HEALTHY");
});

test("combineStatuses: CRITICAL beats WARNING beats HEALTHY", () => {
  assert.equal(combineStatuses(["HEALTHY", "WARNING", "CRITICAL"]), "CRITICAL");
  assert.equal(combineStatuses(["HEALTHY", "WARNING"]), "WARNING");
  assert.equal(combineStatuses(["HEALTHY", "HEALTHY"]), "HEALTHY");
});

test("combineStatuses: all-UNKNOWN stays UNKNOWN rather than defaulting to a false HEALTHY", () => {
  assert.equal(combineStatuses(["UNKNOWN", "UNKNOWN"]), "UNKNOWN");
});

test("combineStatuses: a mix including UNKNOWN alongside HEALTHY still reports HEALTHY (UNKNOWN never masks a real problem, but also isn't itself treated as one)", () => {
  assert.equal(combineStatuses(["HEALTHY", "UNKNOWN"]), "HEALTHY");
});
