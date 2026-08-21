import assert from "node:assert/strict";
import test from "node:test";
import { rejectImpossibleJumps, movingMedianSmooth, filterTrajectory, MAX_PLAUSIBLE_SPEED_UNITS_PER_SECOND } from "./trajectory-filtering";

test("rejectImpossibleJumps keeps every sample when movement is plausible", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 1000, courtX: 2, courtY: 0 }, // 2 units/s, well under the ceiling
  ];
  const result = rejectImpossibleJumps(samples);
  assert.ok(result.every((s) => !s.rejected));
});

test("rejectImpossibleJumps flags (not drops) a sample implying an impossible speed", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 100, courtX: 50, courtY: 0 }, // 500 units/s - impossible for a person
  ];
  const result = rejectImpossibleJumps(samples);
  assert.equal(result.length, 2);
  assert.equal(result[1].rejected, true);
  assert.equal(result[1].rejectReason, "IMPOSSIBLE_JUMP");
});

test("rejectImpossibleJumps measures speed from the last ACCEPTED sample, not the immediately-prior rejected one", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 100, courtX: 50, courtY: 0 }, // rejected - impossible jump
    { videoTimeMs: 1100, courtX: 1, courtY: 0 }, // plausible relative to time=0, not to the rejected sample
  ];
  const result = rejectImpossibleJumps(samples);
  assert.equal(result[1].rejected, true);
  assert.equal(result[2].rejected, false);
});

test("MAX_PLAUSIBLE_SPEED_UNITS_PER_SECOND is documented as a real, sane bound (not near-infinite)", () => {
  assert.ok(MAX_PLAUSIBLE_SPEED_UNITS_PER_SECOND > 5 && MAX_PLAUSIBLE_SPEED_UNITS_PER_SECOND < 20);
});

test("movingMedianSmooth reduces the influence of a single-sample spike", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 1000, courtX: 0, courtY: 0 },
    { videoTimeMs: 2000, courtX: 100, courtY: 0 }, // spike
    { videoTimeMs: 3000, courtX: 0, courtY: 0 },
    { videoTimeMs: 4000, courtX: 0, courtY: 0 },
  ];
  const smoothed = movingMedianSmooth(samples, 5);
  // The spike's own smoothed value should be far below the raw 100, since it's an outlier in its window.
  assert.ok(smoothed[2].courtX < 10);
});

test("movingMedianSmooth throws for an even window size (no true center sample)", () => {
  assert.throws(() => movingMedianSmooth([{ videoTimeMs: 0, courtX: 0, courtY: 0 }], 4));
});

test("filterTrajectory: the full pipeline rejects jumps before smoothing, and reports how many were rejected", () => {
  const samples = [
    { videoTimeMs: 0, courtX: 0, courtY: 0 },
    { videoTimeMs: 1000, courtX: 3, courtY: 0 }, // 3 units/s - plausible
    { videoTimeMs: 1100, courtX: 500, courtY: 0 }, // impossible jump
    { videoTimeMs: 2000, courtX: 3.2, courtY: 0 }, // plausible relative to the last accepted sample
  ];
  const { filtered, rejectedCount } = filterTrajectory(samples, 3);
  assert.equal(rejectedCount, 1);
  assert.equal(filtered.length, samples.length - rejectedCount);
});
