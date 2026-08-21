# Vision Model Governance

G.22, Parts XLI-XLIV. `VisionModel` (G.21 schema, unchanged) + this track's evaluation functions
as the intended gate.

## The rule this track establishes

No `VisionModel` should be treated as suitable for any production-adjacent use (informing review
queues at scale, feeding a public-facing feature) until it has a real, recorded benchmark produced
by `evaluateDetections()`/`evaluateTracking()`/the spatial-metric functions against real,
human-reviewed ground truth - not a vendor-claimed accuracy figure, not an architectural
assumption. Today, zero `VisionModel` rows have any such benchmark, because zero real evaluations
have ever been run (see `VISION_EMPIRICAL_BENCHMARK.md`).

## What "governance" means concretely here

This track does not add a new approval-workflow schema field (Part XLIV warns against building
process machinery ahead of having anything to govern). Governance today is a documented rule plus
the existing `VisionAnalysisRun`/`VisionModel` audit trail (`createdBy`, timestamps, unchanged
from G.21) - sufficient to answer "who ran what, when, against which model" once real runs exist.
A heavier approval-state-machine can be added later if/when there are enough real models and real
benchmark comparisons to justify one; adding it now would be speculative.

## Versioning

`VisionModel.key` + `version` (G.21, unchanged) is the existing identity scheme - any new model
version is a new row, never an in-place mutation of an existing one, so historical
`VisionAnalysisRun`s always point at the exact model version that produced them.

## Current empirical status

No model has ever been benchmarked against real data. This document describes the governance
*rule*, which is real and enforceable today; it does not describe any actual approved model,
because none exists yet.
