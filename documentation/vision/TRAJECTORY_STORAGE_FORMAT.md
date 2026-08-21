# Trajectory Storage Format

G.22, Parts XXVII-XXX. `VisionTrajectoryArtifact` model + `src/lib/vision/trajectory-filtering.ts`.

## Why trajectories aren't stored as normal rows

A single player-track at even a modest sample rate produces far more points than is sane to
store as individual `VisionObservation` rows long-term. `VisionTrajectoryArtifact` instead
references an object-storage file (JSONL by default, `format` field left open for future formats)
holding the raw or filtered point sequence, the same "row references a blob" pattern
`MediaAsset`/`MediaAssetVariant` already use elsewhere in this codebase - not a new storage
philosophy, a reused one.

## Fields

`gameVideoId`/`analysisRunId` (both link back to source), `storageProvider`/`objectKey` (where the
file lives), `checksumSha256`/`byteSize` (integrity, same discipline as `MediaAsset`),
`sampleCount`, `timeRangeStartMs`/`timeRangeEndMs`, `trackRefs` (Json, which `VisionTrack` IDs this
artifact covers), `filtered` + `filterMethod` (whether `rejectImpossibleJumps`/
`movingMedianSmooth` were applied, and which - never silently applied without being recorded).

## Filtering pipeline (Part XXIX)

`rejectImpossibleJumps()` flags (never silently drops) any sample implying speed above
`MAX_PLAUSIBLE_SPEED_UNITS_PER_SECOND = 12` (units/second - roughly 43 km/h, a generous ceiling
chosen to sit above any real human sprint speed without being so tight it rejects legitimate fast
movement), measured from the last *accepted* sample so one bad point can't cascade into rejecting
everything after it. `movingMedianSmooth()` requires an odd window size and is robust to isolated
spikes - chosen over a Kalman filter or Savitzky-Golay as an honestly simple starting point, not
claimed to be the best possible choice (Part XXIX: "do not claim an optimal filter without
justification"). `filterTrajectory()` composes both, rejecting before smoothing so a flagged
sample can't contaminate its neighbors' medians.

## Current empirical status

No trajectory has ever been produced or filtered against real data - zero `VisionTrajectoryArtifact`
rows exist. Both filtering functions are exercised only by synthetic unit-test data. See
`VISION_EMPIRICAL_BENCHMARK.md`.
