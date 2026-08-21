import assert from "node:assert/strict";
import test from "node:test";
import { classifyCalibrationQuality } from "./calibration-quality";

test("classifyCalibrationQuality: FAILED with fewer than 4 landmarks regardless of error", () => {
  assert.equal(classifyCalibrationQuality(0.01, 3), "FAILED");
});

test("classifyCalibrationQuality: FAILED when error exceeds the low-quality ceiling", () => {
  assert.equal(classifyCalibrationQuality(1.5, 8), "FAILED");
});

test("classifyCalibrationQuality: HIGH requires both low error and enough landmarks", () => {
  assert.equal(classifyCalibrationQuality(0.05, 8), "HIGH");
});

test("classifyCalibrationQuality: low error but too few landmarks does not reach HIGH", () => {
  assert.equal(classifyCalibrationQuality(0.05, 5), "MEDIUM");
});

test("classifyCalibrationQuality: MEDIUM error band", () => {
  assert.equal(classifyCalibrationQuality(0.3, 8), "MEDIUM");
});

test("classifyCalibrationQuality: LOW error band", () => {
  assert.equal(classifyCalibrationQuality(0.7, 8), "LOW");
});
