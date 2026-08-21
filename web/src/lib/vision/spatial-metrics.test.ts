import assert from "node:assert/strict";
import test from "node:test";
import { computeDistanceCovered, computeInstantaneousSpeed, computeAveragePosition, computeZoneOccupancy } from "./spatial-metrics";

test("computeDistanceCovered sums straight-line segments between consecutive samples", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 1000, courtX: 3, courtY: 4 }, // distance 5
    { videoTimeMs: 2000, courtX: 3, courtY: 0 }, // distance 4
  ];
  const result = computeDistanceCovered(samples);
  assert.equal(result.distanceUnits, 9);
});

test("computeDistanceCovered reports INSUFFICIENT_DATA with fewer than 2 samples, never a fabricated distance", () => {
  const result = computeDistanceCovered([{ videoTimeMs: 0, courtX: 0, courtY: 0 }]);
  assert.equal(result.quality, "INSUFFICIENT_DATA");
  assert.equal(result.distanceUnits, 0);
});

test("computeInstantaneousSpeed flags (LOW quality) a speed beyond the plausible ceiling instead of hiding it", () => {
  const a = { videoTimeMs: 0, courtX: 0, courtY: 0 };
  const b = { videoTimeMs: 100, courtX: 50, courtY: 0 };
  const result = computeInstantaneousSpeed(a, b, 12);
  assert.equal(result.quality, "LOW");
  assert.ok(result.instantaneousUnitsPerSecond > 12);
});

test("computeInstantaneousSpeed reports HIGH quality for a plausible speed", () => {
  const a = { videoTimeMs: 0, courtX: 0, courtY: 0 };
  const b = { videoTimeMs: 1000, courtX: 5, courtY: 0 };
  const result = computeInstantaneousSpeed(a, b, 12);
  assert.equal(result.quality, "HIGH");
});

test("computeAveragePosition computes a real centroid", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 1000, courtX: 10, courtY: 10 },
  ];
  const result = computeAveragePosition(samples);
  assert.equal(result.averageCourtX, 5);
  assert.equal(result.averageCourtY, 5);
});

test("computeZoneOccupancy attributes time to UNAVAILABLE when the classifier has no answer (matches court-zones.ts's honest current behavior)", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 1000, courtX: 1, courtY: 1 },
  ];
  const result = computeZoneOccupancy(samples, () => ({ zone: null }));
  assert.equal(result.unavailableMs, 1000);
  assert.deepEqual(result.occupancyMs, {});
});

test("computeZoneOccupancy attributes time to a real zone when the classifier resolves one", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 1000, courtX: 1, courtY: 1 },
  ];
  const result = computeZoneOccupancy(samples, () => ({ zone: "PAINT" }));
  assert.equal(result.occupancyMs["PAINT"], 1000);
});
