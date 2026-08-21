# Vision Failure Cases

G.22, Parts XXXVI-XL. `VisionFailureCategory` enum + `/vision/failures`.

## Purpose

A dedicated, honest place to record *how* vision output was wrong, not just whether it matched.
Part XXXVI's instruction: build the failure-taxonomy and review surface now, even with no data,
so that once real footage exists the review workflow doesn't need to be invented under pressure.

## Categories

`FALSE_POSITIVE`, `FALSE_NEGATIVE`, `ID_SWITCH`, `BAD_CALIBRATION`, `JERSEY_ERROR`,
`TIMELINE_ERROR`, `OCCLUSION`, `AMBIGUOUS` - applied to `VisionObservation.failureCategory` or
`VisionEventMatch.failureCategory` by a human reviewer during the existing REJECTED/AMBIGUOUS
review flow (`reviewObservationAction`/`reviewEventMatchAction`, G.21-era, unchanged this track -
the failure category is an additional optional field on an existing review action, not a new
workflow).

## `/vision/failures`

Reads `listFailureCases()` (`vision-loader.ts`) - every observation/match with a non-null
`failureCategory`, grouped for review. Built as a real, working page; its real state today is
empty, because zero observations exist to ever have been categorized.

## Why this matters even while blocked

When real footage eventually produces real vision output, some of it will be wrong. Having the
categorization taxonomy and the review surface already built (not invented later, under the
pressure of a live benchmark) is exactly the kind of foundation work Part XXXVI asks for - the
same "architecture now, data later" pattern as the rest of G.22's schema and functions.

## Current empirical status

Zero failure cases exist, because zero observations exist. See `VISION_EMPIRICAL_BENCHMARK.md`.
