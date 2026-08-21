import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTask, computeTemporalErrorStats, computeAttributionAccuracy } from "./vision-evaluation";

test("evaluateTask computes precision/recall/F1 from true/false positives and false negatives", () => {
  const report = evaluateTask({
    task: "SHOT_MADE",
    outcomes: [
      { groundTruthId: "e1", matchedObservationId: "o1" }, // TP
      { groundTruthId: "e2", matchedObservationId: "o2" }, // TP
      { groundTruthId: "e3", matchedObservationId: null }, // FN
    ],
    unmatchedObservations: [{ observationId: "o3" }], // FP
  });
  assert.equal(report.truePositives, 2);
  assert.equal(report.falseNegatives, 1);
  assert.equal(report.falsePositives, 1);
  assert.equal(report.precision, 2 / 3);
  assert.equal(report.recall, 2 / 3);
  assert.ok(report.f1! > 0.6 && report.f1! < 0.7);
});

test("evaluateTask never fabricates a metric when there is nothing to compute it from", () => {
  const report = evaluateTask({ task: "REBOUND", outcomes: [], unmatchedObservations: [] });
  assert.equal(report.precision, null);
  assert.equal(report.recall, null);
  assert.equal(report.f1, null);
});

test("evaluateTask: perfect precision/recall with zero errors", () => {
  const report = evaluateTask({
    task: "SHOT_ATTEMPT",
    outcomes: [{ groundTruthId: "e1", matchedObservationId: "o1" }],
    unmatchedObservations: [],
  });
  assert.equal(report.precision, 1);
  assert.equal(report.recall, 1);
  assert.equal(report.f1, 1);
});

test("computeTemporalErrorStats returns null with no samples rather than fabricating a zero", () => {
  assert.equal(computeTemporalErrorStats([]), null);
});

test("computeTemporalErrorStats computes mean/median/max over absolute errors", () => {
  const stats = computeTemporalErrorStats([100, -200, 300]);
  assert.equal(stats!.sampleCount, 3);
  assert.equal(stats!.maxMs, 300);
  assert.ok(stats!.meanMs > 0);
});

test("computeAttributionAccuracy returns null accuracy with no samples", () => {
  assert.equal(computeAttributionAccuracy([]).accuracy, null);
});

test("computeAttributionAccuracy computes correct/incorrect/accuracy over true positives only", () => {
  const result = computeAttributionAccuracy([{ correct: true }, { correct: true }, { correct: false }]);
  assert.equal(result.correct, 2);
  assert.equal(result.incorrect, 1);
  assert.equal(result.accuracy, 2 / 3);
});
