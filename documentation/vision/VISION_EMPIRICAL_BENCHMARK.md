# Vision Empirical Benchmark

G.22, Parts XVIII-XXVI, LXVIII-LXX. The measurement framework this track built, and its result
when actually run against this environment's real data.

## What "empirical" means here

Every other vision document in this codebase (G.21's `AI_VISION_ARCHITECTURE.md` and friends)
describes architecture: what a `VisionObservation` row *would* mean, what a `VisionAnalysisRun`
*would* produce. This document is different on purpose - it reports what happened when the
measurement functions built in G.22 (`detection-metrics.ts`, `tracking-metrics.ts`,
`spatial-metrics.ts`, `calibration-quality.ts`) were actually pointed at this environment's data.

## The result

**`VISION_EMPIRICAL_VALIDATION: BLOCKED_NO_REAL_VIDEO`**, per Part LXX's own instruction for
exactly this situation. Specifically:

- Zero `GameVideo` rows exist (no video has ever been registered against a real fixture).
- Zero `VisionAnalysisRun` rows exist (nothing has ever been queued or executed).
- Zero `VisionObservation` rows exist.
- Zero `CourtCalibration` rows exist, and zero `CourtSpecification` rows carry `status: OFFICIAL`.
- The user was asked directly, before any implementation work began this track, whether real
  Ultra Basketball video or official court dimensions were available. The answer was: neither.

Every evaluation function this track built (`evaluateDetections`, `evaluateTracking`,
`computeDistanceCovered`, `evaluateFourPointSpatialQualification`, `classifyCalibrationQuality`)
is real, unit-tested code - not a stub. What's missing is not code, it's data: a genuine video
frame with a genuine detection to score against a genuine ground-truth box. There is no shortcut
around that; generating synthetic ground truth and reporting the resulting precision/recall
numbers as if they described real Ultra Basketball players would be fabrication, which Part LXX
explicitly forbids ("do not generate synthetic accuracy numbers").

## What IS empirically true today

Two things were actually run against real (if metadata-only) state, and both are genuine
measurements, not architecture:

1. `probeVideoFile()` against this deployment - **real**, confirmed absence of `ffprobe` on both
   the production server and the local dev machine (see `VIDEO_INGESTION_PIPELINE.md`).
2. `evaluateFourPointSpatialQualification()` against this deployment's actual `CourtSpecification`
   rows (0 of them `OFFICIAL`) - **real**, confirmed every call returns `GEOMETRY_UNAVAILABLE`
   today (see `FOUR_POINT_SPATIAL_RULE.md`).

Both are legitimate empirical findings. They just aren't the detection/tracking/spatial-accuracy
numbers Parts XVIII-LXX ask for, because those require footage that doesn't exist yet.

## What unblocks this

Exactly two things, both outside what code can produce: a real Ultra Basketball game video
(registered as a `GameVideo`, ideally with at least one human-reviewed ground-truth clip), and an
official court specification (real measurements, entered via `/vision/videos`, then explicitly
marked `OFFICIAL`). Once both exist, `scripts/vision-analyze.ts` plus the metric functions above
are already built and ready to produce a first real benchmark - no further scaffolding is needed.
