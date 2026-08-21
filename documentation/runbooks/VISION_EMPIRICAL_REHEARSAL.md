# Runbook: Vision Empirical Rehearsal

G.22, Parts LXVIII-LXXII. The step this track's own name promises - a *measured*, not
architectural, benchmark - and why it did not happen this session.

## Status: VISION_EMPIRICAL_VALIDATION: BLOCKED_NO_REAL_VIDEO

Before any implementation work began, the user was asked directly whether real Ultra Basketball
video or official court dimensions were available for this track. The answer: neither. This is
the same blocking condition `VISION_ANALYSIS_REHEARSAL.md` (G.21) reported, re-confirmed at the
start of G.22 via a fresh database check (zero `GameVideo`, zero `VisionAnalysisRun`, zero
`VisionObservation`, zero `CourtCalibration`, zero `CourtSpecification` rows with
`status: OFFICIAL`). Per Part LXX's own instruction, this track stopped short of any empirical
claim and built only the measurement architecture: `detection-metrics.ts`, `tracking-metrics.ts`,
`spatial-metrics.ts`, `trajectory-filtering.ts`, `calibration-quality.ts`,
`four-point-spatial-rule.ts`, `attacking-direction.ts` - all real, all unit-tested against
synthetic data, none ever run against a real frame. See `VISION_EMPIRICAL_BENCHMARK.md` for the
complete accounting.

## How to run this rehearsal for real, once both inputs exist

This extends `VISION_ANALYSIS_REHEARSAL.md`'s 6 steps with the G.22-specific measurement stage:

1-6. Register video → create timeline anchors → run the POC → review detections → match against
   canonical events → compute `evaluateTask()` metrics. (Unchanged from G.21's runbook.)
7. **Enter and mark official court geometry.** On `/vision/videos`, create a `CourtSpecification`
   for the relevant `Venue` (DRAFT by default), fill in real measured values (court dimensions,
   basket coordinates, half-court line - see `ULTRA_COURT_SPECIFICATION.md`), then explicitly call
   `markCourtSpecificationOfficial()`. Only after this step does
   `evaluateFourPointSpatialQualification()` ever return anything other than
   `GEOMETRY_UNAVAILABLE`.
8. **Set attacking direction.** On the same page, set `Game.homeAttacksBasketFirstHalf` for the
   game being analyzed - required for `attackingBasketForPeriod()` to resolve a real side per
   period.
9. **Calibrate the video.** Enter ≥4 reference points on `/vision/games/[fixtureId]` to fit a
   `CourtCalibration`; check `classifyCalibrationQuality()`'s band (`HIGH`/`MEDIUM`/`LOW`/`FAILED`)
   before trusting any spatial output from this video.
10. **Have a reviewer draw ground-truth boxes** for a real sample of frames, and **build
    ground-truth identity spans** for tracking - both are prerequisites `detection-metrics.ts`/
    `tracking-metrics.ts` need as input; no labeling UI exists yet (see
    `PLAYER_DETECTION_EVALUATION.md`) so this step is manual/off-platform today.
11. **Run `evaluateDetections()`/`evaluateTracking()`/the spatial-metric functions** against the
    real ground truth from step 10, with a real trajectory filtered via `filterTrajectory()` and
    stored as a `VisionTrajectoryArtifact`. This is the first point at which any of these
    functions will have ever touched real data.
12. **Categorize failures** via `/vision/failures` as they're found, and **export the dataset**
    via `/api/vision/games/[gameVideoId]/export` for any offline analysis.

## Hand verification (Part LXIX, unchanged in spirit from G.21's LXXII)

Not attempted this track for the same reason as G.21: no real video/observations exist to
hand-verify. This remains the first real task once step 1 above happens for real.

## What this runbook is NOT

A claim that G.22 measured anything. It measured nothing empirically - it built the instruments
and confirmed, honestly, that there is nothing yet to point them at.
