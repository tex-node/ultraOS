import assert from "node:assert/strict";
import test from "node:test";
import { LEGACY_RULE_SNAPSHOT, type RuleSnapshotForScoring } from "../ultra-scoring-engine";
import {
  CLIENT_OBSERVATION_MAX_AGE_MS,
  CLIENT_OBSERVATION_MAX_SKEW_MS,
  isClientObservedAtPlausible,
  validateClientResolvedShot,
} from "./validate-client-shot";

const RULES: RuleSnapshotForScoring = LEGACY_RULE_SNAPSHOT;
const RULES_NO_4PT: RuleSnapshotForScoring = { ...RULES, fourPointEnabled: false };
const RULES_NO_ULTRA_TIME: RuleSnapshotForScoring = { ...RULES, ultraTimeEnabled: false };

test("validateClientResolvedShot accepts a plain 2PT outside Ultra Time", () => {
  const result = validateClientResolvedShot({ basePointValue: 2, multiplier: 1, points: 2, isUltraTime: false }, RULES);
  assert.deepEqual(result, { valid: true });
});

test("validateClientResolvedShot accepts a doubled 3PT inside Ultra Time", () => {
  const result = validateClientResolvedShot({ basePointValue: 3, multiplier: 2, points: 6, isUltraTime: true }, RULES);
  assert.deepEqual(result, { valid: true });
});

test("validateClientResolvedShot rejects a basePointValue outside 1-4", () => {
  for (const basePointValue of [0, -1, 5, 2.5]) {
    const result = validateClientResolvedShot({ basePointValue, multiplier: 1, points: basePointValue, isUltraTime: false }, RULES);
    assert.deepEqual(result, { valid: false, error: "INVALID_BASE_POINT_VALUE" });
  }
});

test("validateClientResolvedShot rejects a 4PT assertion when the rules disable it", () => {
  const result = validateClientResolvedShot({ basePointValue: 4, multiplier: 1, points: 4, isUltraTime: false }, RULES_NO_4PT);
  assert.deepEqual(result, { valid: false, error: "FOUR_POINT_DISABLED" });
});

test("validateClientResolvedShot rejects a multiplier that isn't 1 or the rules' own Ultra Time multiplier", () => {
  const result = validateClientResolvedShot({ basePointValue: 2, multiplier: 3, points: 6, isUltraTime: true }, RULES);
  assert.deepEqual(result, { valid: false, error: "INVALID_MULTIPLIER" }, "a client can't assert an arbitrary multiplier, only one these rules can ever produce");
});

test("validateClientResolvedShot rejects isUltraTime=true paired with multiplier=1 (or the reverse)", () => {
  assert.deepEqual(
    validateClientResolvedShot({ basePointValue: 2, multiplier: 1, points: 2, isUltraTime: true }, RULES),
    { valid: false, error: "ULTRA_TIME_MULTIPLIER_MISMATCH" },
  );
  assert.deepEqual(
    validateClientResolvedShot({ basePointValue: 2, multiplier: 2, points: 4, isUltraTime: false }, RULES),
    { valid: false, error: "ULTRA_TIME_MULTIPLIER_MISMATCH" },
  );
});

test("validateClientResolvedShot rejects an Ultra Time assertion when the rules have it disabled entirely", () => {
  const result = validateClientResolvedShot({ basePointValue: 2, multiplier: 2, points: 4, isUltraTime: true }, RULES_NO_ULTRA_TIME);
  assert.deepEqual(result, { valid: false, error: "ULTRA_TIME_DISABLED" });
});

test("validateClientResolvedShot rejects points that don't equal basePointValue * multiplier", () => {
  const result = validateClientResolvedShot({ basePointValue: 3, multiplier: 2, points: 5, isUltraTime: true }, RULES);
  assert.deepEqual(result, { valid: false, error: "POINTS_MISMATCH" });
});

test("isClientObservedAtPlausible accepts a recent timestamp", () => {
  const now = Date.parse("2026-09-28T20:00:00.000Z");
  assert.equal(isClientObservedAtPlausible("2026-09-28T19:55:00.000Z", now), true);
});

test("isClientObservedAtPlausible rejects a timestamp further in the future than the skew tolerance", () => {
  const now = Date.parse("2026-09-28T20:00:00.000Z");
  const tooFarFuture = new Date(now + CLIENT_OBSERVATION_MAX_SKEW_MS + 1000).toISOString();
  assert.equal(isClientObservedAtPlausible(tooFarFuture, now), false);
  const justInsideSkew = new Date(now + CLIENT_OBSERVATION_MAX_SKEW_MS - 1000).toISOString();
  assert.equal(isClientObservedAtPlausible(justInsideSkew, now), true);
});

test("isClientObservedAtPlausible rejects a timestamp older than the max age", () => {
  const now = Date.parse("2026-09-28T20:00:00.000Z");
  const tooOld = new Date(now - CLIENT_OBSERVATION_MAX_AGE_MS - 1000).toISOString();
  assert.equal(isClientObservedAtPlausible(tooOld, now), false);
  const justInsideAge = new Date(now - CLIENT_OBSERVATION_MAX_AGE_MS + 1000).toISOString();
  assert.equal(isClientObservedAtPlausible(justInsideAge, now), true);
});

test("isClientObservedAtPlausible rejects a garbage/unparseable timestamp", () => {
  assert.equal(isClientObservedAtPlausible("not-a-date"), false);
});
