# Spatial Metric Quality

G.22, Parts XXXI-XXXV, LV. `src/lib/vision/spatial-metrics.ts`.

## Every derived metric carries a quality label

`computeDistanceCovered()`, `computeInstantaneousSpeed()`, `computeAveragePosition()`,
`computeZoneOccupancy()` each return a `MetricQuality` alongside the value: `HIGH` | `MEDIUM` |
`LOW` | `INSUFFICIENT_DATA`. Quality is derived from sample density (samples per minute of
coverage) - a distance-covered figure computed from one sample every 10 seconds is real, but it is
not the same quality of claim as one computed from 10 samples per second, and Part LV's own
instruction ("do not show false precision") means the UI is expected to display the quality label
next to the number, not the number alone.

## `INSUFFICIENT_DATA`, not a fabricated zero

When sample density is too low to support any meaningful claim (or there are fewer than 2 samples
to compute a delta from), these functions return `INSUFFICIENT_DATA` and no value, rather than a
technically-computable-but-meaningless number like "0.0 units covered."

## Zone occupancy depends on court zones being available

`computeZoneOccupancy()` calls `classifyCourtZone()` (from G.21's `court-zones.ts`, unchanged this
track) for each sample. That function honestly returns `UNAVAILABLE` for every zone today, because
(same root cause as `four-point-spatial-rule.ts`) no `OFFICIAL` court specification with zone
geometry exists yet. `computeZoneOccupancy()` itself isn't blocked - it correctly aggregates
whatever `classifyCourtZone()` returns - but its real output today is "100% UNAVAILABLE," which is
the honest answer, not a defect in this function.

## Current empirical status

Never run against real trajectory data - see `VISION_EMPIRICAL_BENCHMARK.md`. All four functions
are exercised only by synthetic unit-test inputs.
