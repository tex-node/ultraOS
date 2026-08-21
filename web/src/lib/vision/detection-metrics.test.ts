import assert from "node:assert/strict";
import test from "node:test";
import { intersectionOverUnion, evaluateDetections, type Box } from "./detection-metrics";

test("intersectionOverUnion is 1 for identical boxes", () => {
  const box: Box = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(intersectionOverUnion(box, box), 1);
});

test("intersectionOverUnion is 0 for non-overlapping boxes", () => {
  assert.equal(intersectionOverUnion({ x: 0, y: 0, width: 10, height: 10 }, { x: 100, y: 100, width: 10, height: 10 }), 0);
});

test("intersectionOverUnion computes a real partial overlap correctly", () => {
  // Two 10x10 boxes overlapping in a 5x10 region: intersection=50, union=100+100-50=150
  const iou = intersectionOverUnion({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 });
  assert.ok(Math.abs(iou - 50 / 150) < 1e-9);
});

test("evaluateDetections: perfect match gives precision=recall=f1=1 with the right TP/FP/FN", () => {
  const boxes: Box[] = [{ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 50, width: 10, height: 10 }];
  const result = evaluateDetections(boxes, boxes, 0.5);
  assert.equal(result.truePositives, 2);
  assert.equal(result.falsePositives, 0);
  assert.equal(result.falseNegatives, 0);
  assert.equal(result.precision, 1);
  assert.equal(result.recall, 1);
  assert.equal(result.f1, 1);
});

test("evaluateDetections: a prediction with no ground truth is a false positive", () => {
  const result = evaluateDetections([], [{ x: 0, y: 0, width: 10, height: 10 }], 0.5);
  assert.equal(result.falsePositives, 1);
  assert.equal(result.truePositives, 0);
  assert.equal(result.precision, 0);
  assert.equal(result.recall, null);
});

test("evaluateDetections: a ground truth with no prediction is a false negative", () => {
  const result = evaluateDetections([{ x: 0, y: 0, width: 10, height: 10 }], [], 0.5);
  assert.equal(result.falseNegatives, 1);
  assert.equal(result.recall, 0);
  assert.equal(result.precision, null);
});

test("evaluateDetections: the IoU threshold is respected - a low-overlap prediction does not count as a match", () => {
  const gt: Box[] = [{ x: 0, y: 0, width: 10, height: 10 }];
  const pred: Box[] = [{ x: 9, y: 9, width: 10, height: 10 }]; // barely overlaps, IoU well under 0.5
  const result = evaluateDetections(gt, pred, 0.5);
  assert.equal(result.truePositives, 0);
  assert.equal(result.falsePositives, 1);
  assert.equal(result.falseNegatives, 1);
});

test("evaluateDetections: greedy matching is one-to-one - a duplicate prediction over one ground truth box counts as an extra false positive", () => {
  const gt: Box[] = [{ x: 0, y: 0, width: 10, height: 10 }];
  const pred: Box[] = [{ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 }];
  const result = evaluateDetections(gt, pred, 0.5);
  assert.equal(result.truePositives, 1);
  assert.equal(result.falsePositives, 1);
});

test("evaluateDetections: reports the IoU threshold used, for reproducibility", () => {
  const result = evaluateDetections([], [], 0.7);
  assert.equal(result.iouThreshold, 0.7);
});
