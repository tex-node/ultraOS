import assert from "node:assert/strict";
import test from "node:test";
import { computeHomography, applyHomography, meanReprojectionError } from "./court-homography";

test("computeHomography returns null with fewer than 4 reference points", () => {
  assert.equal(computeHomography([{ imageX: 0, imageY: 0, courtX: 0, courtY: 0 }]), null);
});

test("computeHomography exactly recovers a known simple scale+translate mapping from 4 points", () => {
  // court = image * 2 + 10 (identity-like scale/offset, no perspective distortion)
  const points = [
    { imageX: 0, imageY: 0, courtX: 10, courtY: 10 },
    { imageX: 10, imageY: 0, courtX: 30, courtY: 10 },
    { imageX: 0, imageY: 10, courtX: 10, courtY: 30 },
    { imageX: 10, imageY: 10, courtX: 30, courtY: 30 },
  ];
  const matrix = computeHomography(points);
  assert.ok(matrix !== null);
  const projected = applyHomography(matrix!, 5, 5);
  assert.ok(Math.abs(projected.courtX - 20) < 0.01);
  assert.ok(Math.abs(projected.courtY - 20) < 0.01);
});

test("meanReprojectionError is near zero for an exact fit", () => {
  const points = [
    { imageX: 0, imageY: 0, courtX: 0, courtY: 0 },
    { imageX: 10, imageY: 0, courtX: 20, courtY: 0 },
    { imageX: 0, imageY: 10, courtX: 0, courtY: 20 },
    { imageX: 10, imageY: 10, courtX: 20, courtY: 20 },
  ];
  const matrix = computeHomography(points)!;
  assert.ok(meanReprojectionError(matrix, points) < 0.01);
});

test("meanReprojectionError is meaningfully nonzero for a noisy/inconsistent calibration", () => {
  const points = [
    { imageX: 0, imageY: 0, courtX: 0, courtY: 0 },
    { imageX: 10, imageY: 0, courtX: 20, courtY: 0 },
    { imageX: 0, imageY: 10, courtX: 0, courtY: 20 },
    { imageX: 10, imageY: 10, courtX: 500, courtY: 500 }, // grossly inconsistent with the others
  ];
  const consistentMatrix = computeHomography(points.slice(0, 3).concat([{ imageX: 10, imageY: 10, courtX: 20, courtY: 20 }]))!;
  const noisyMatrix = computeHomography(points)!;
  const consistentError = meanReprojectionError(consistentMatrix, points.slice(0, 3).concat([{ imageX: 10, imageY: 10, courtX: 20, courtY: 20 }]));
  const noisyError = meanReprojectionError(noisyMatrix, points);
  assert.ok(noisyError > consistentError, `expected noisy error (${noisyError}) > consistent error (${consistentError})`);
});

test("computeHomography returns null for degenerate (collinear) points", () => {
  const points = [
    { imageX: 0, imageY: 0, courtX: 0, courtY: 0 },
    { imageX: 1, imageY: 0, courtX: 1, courtY: 0 },
    { imageX: 2, imageY: 0, courtX: 2, courtY: 0 },
    { imageX: 3, imageY: 0, courtX: 3, courtY: 0 },
  ]; // all on one line - cannot determine a 2D homography
  assert.equal(computeHomography(points), null);
});
