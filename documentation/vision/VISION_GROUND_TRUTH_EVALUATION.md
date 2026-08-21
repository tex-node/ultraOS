# Vision Ground-Truth Evaluation

G.21, Part XXIX-XXXIII. `src/lib/vision/vision-evaluation.ts` (pure, fully unit-tested).

## Canonical GameEvent = ground truth. VisionObservation = prediction

This module never computes a universal accuracy figure (Part XXIX's explicit prohibition of
"VISION ACCURACY = 92%"). `evaluateTask()` takes one `task` label (e.g. `"SHOT_MADE"`,
`"CANONICAL_EVENT_MATCH"`) and returns metrics for that task alone; a report only exists for a
task this track (or a future one) actually generated outcomes for.

## True positive / false positive / false negative - defined precisely (Part XXXI)

- **True positive**: a canonical `GameEvent` with a reviewed, human-`CONFIRMED`
  `VisionEventMatch`.
- **False negative**: a canonical `GameEvent` with no matching observation at all
  (`matchedObservationId: null` in the evaluation input).
- **False positive**: a `VisionObservation` of the task's type with no canonical event it
  corresponds to (explicitly rejected during review, or never matched).

For player-attributed metrics, an additional requirement applies: the matched observation's
player candidate must equal the canonical event's real player (`computeAttributionAccuracy()`) -
this is only meaningful over true positives; there is no player attribution to score for an event
with no match at all.

## Precision / Recall / F1

Standard definitions (`precision = TP/(TP+FP)`, `recall = TP/(TP+FN)`,
`f1 = 2PR/(P+R)`), computed only when the denominator is nonzero - `evaluateTask()` returns `null`
for a metric it cannot honestly compute, never a fabricated 0 or 1.

## Temporal error

`computeTemporalErrorStats()` reports mean/median/max absolute error in milliseconds, only over
genuine true positives. An unmatched event has no temporal error to report.

## Task-specific, per Part XXX

Metrics are only ever computed for a task this system actually has outcomes for. This track built
the evaluation machinery and exercised it against `CANONICAL_EVENT_MATCH` coverage on the fixture
vision workspace page; per-task breakdowns for `PLAYER_DETECTION`/`PLAYER_TRACKING`/
`PLAYER_IDENTIFICATION`/`SHOT_ATTEMPT`/`SHOT_MADE`/`REBOUND`/`EVENT_TIMING` individually are
supported by the same `evaluateTask()` function but were never run, because no real detections
exist yet to evaluate (see `PLAYER_TRACKING_FOUNDATION.md`'s "offline proof-of-concept" section).

## Reproducibility (Part LXII-LXIII)

Every `VisionAnalysisRun` records its `visionModelId`/`configHash`. A future evaluation report
generator should additionally record `groundTruthGeneratedAt` (or a canonical-event hash) at
report time, so a later canonical-stat correction (G.17's post-final correction flow) doesn't
silently invalidate an old benchmark without anyone noticing - this field is designed for but not
yet implemented in a persisted evaluation-report entity, since no real evaluation run has
happened to need one yet.

## Failure case review (Part XXXII, LXV)

The fixture vision workspace's review queues directly surface both failure shapes: a
`VisionObservation` with no canonical match ("possible false positive," reviewable/rejectable)
and, via the canonical event match coverage list, a canonical event with no vision match
("possible false negative"). A dedicated cross-fixture failure-case gallery was not built this
track (no real failures exist yet to gallery) - the per-fixture review queue is the real,
functioning version of this for the one workspace that exists today.

## G.22 update: the cross-fixture gallery this predicted now exists

`/vision/failures` (built G.22, see `VISION_FAILURE_CASES.md`) is exactly the cross-fixture
gallery this document said wasn't built yet - it reads `listFailureCases()` across all fixtures,
grouped by `VisionFailureCategory`. It is real and working; its real content today is empty,
because zero observations exist anywhere in this environment to have failed. G.22 also added the
detection/tracking/spatial metric functions this document's task-specific evaluation section
anticipated (`PLAYER_DETECTION`, `PLAYER_TRACKING` now have real scoring code in
`detection-metrics.ts`/`tracking-metrics.ts`, not just `evaluateTask()`'s generic machinery) - none
have been run against real outcomes yet. See `VISION_EMPIRICAL_BENCHMARK.md`.
