# Player Detection Evaluation

G.22, Parts XVIII-XXI. `src/lib/vision/detection-metrics.ts`, fully unit-tested, never run
against real data (see `VISION_EMPIRICAL_BENCHMARK.md`).

## Method: IoU-based greedy matching

`intersectionOverUnion(a, b)` computes standard box IoU. `evaluateDetections(groundTruthBoxes,
predictedBoxes, iouThreshold = 0.5)` matches predictions to ground truth greedily, highest-IoU
pair first, one-to-one (a prediction or ground-truth box is used at most once) - the common,
simple baseline matching strategy, chosen over Hungarian/optimal assignment because Part XX asks
for something correct and explainable over something optimal-but-opaque.

## Outputs

`truePositives`, `falsePositives`, `falseNegatives`, `precision`, `recall`, `f1` - and the
`iouThreshold` used is always returned alongside the numbers (Part XIX: never report a bare
number without the threshold that produced it). When there are zero ground-truth boxes and zero
predictions, `precision`/`recall`/`f1` are `null`, never `0` or `1` - a 0/0 division is genuinely
undefined, not "perfect" or "failing."

## What ground truth means here

A ground-truth box is a bounding box a human reviewer drew on a real video frame, confirming a
real player's real position at that moment. This track built the *scoring function*; it did not
build a labeling UI, because there is no video to label yet (Part XVIII's own dependency chain:
labeling tooling only matters once there's footage to label). `VisionObservation` rows already
carry a `boundingBox` Json field (from G.21) that this function's `predictedBoxes` input reads
directly - no new schema was needed for predictions, only for the (not yet built) ground-truth
label storage, which remains a future addition once real clips exist to label.

## Current empirical status

Never run against real data. Zero ground-truth boxes exist because zero video frames have ever
been reviewed. See `VISION_EMPIRICAL_BENCHMARK.md` for the full accounting.
