// Calibration Quality (G.22, Part XXVIII). Pure. Court metrics must inherit calibration quality
// - this is the one function that decides what that quality actually is, from real, documented
// thresholds (never "it looked fine").
export type CalibrationQualityBand = "HIGH" | "MEDIUM" | "LOW" | "FAILED";

// Thresholds are in the calibration's own units (whatever CourtSpecification.units says, e.g.
// meters) - documented here rather than left implicit. These are reasonable starting points, not
// empirically validated against a real Ultra calibration (none has ever been computed in this
// environment - see VISION_EMPIRICAL_BENCHMARK.md).
export const CALIBRATION_QUALITY_THRESHOLDS = {
  highMaxErrorUnits: 0.15,
  mediumMaxErrorUnits: 0.4,
  lowMaxErrorUnits: 1.0,
  minLandmarksForHigh: 6,
  minLandmarksForMedium: 4,
} as const;

export function classifyCalibrationQuality(meanReprojectionErrorUnits: number, landmarkCount: number): CalibrationQualityBand {
  if (landmarkCount < 4) return "FAILED"; // computeHomography() itself requires >=4 points
  if (meanReprojectionErrorUnits > CALIBRATION_QUALITY_THRESHOLDS.lowMaxErrorUnits) return "FAILED";
  if (meanReprojectionErrorUnits > CALIBRATION_QUALITY_THRESHOLDS.mediumMaxErrorUnits) return "LOW";
  if (meanReprojectionErrorUnits > CALIBRATION_QUALITY_THRESHOLDS.highMaxErrorUnits || landmarkCount < CALIBRATION_QUALITY_THRESHOLDS.minLandmarksForHigh) {
    return landmarkCount < CALIBRATION_QUALITY_THRESHOLDS.minLandmarksForMedium ? "LOW" : "MEDIUM";
  }
  return "HIGH";
}
