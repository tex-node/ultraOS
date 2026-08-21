# Multi-Object Tracking Evaluation

G.22, Parts XXII-XXV. `src/lib/vision/tracking-metrics.ts`, fully unit-tested.

## Deliberately simplified - and why

Part XXIV's own instruction: "do not implement complex metrics incorrectly just to have them."
Standard MOT literature metrics (MOTA, IDF1, HOTA) require substantial machinery (frame-by-frame
association matrices, per-frame TP/FP/FN accounting fused with identity continuity) that this
track cannot validate correctly without real tracked data to test the implementation against. So
`evaluateTracking()` implements a smaller, honestly-scoped set instead:

- `trackCount` - how many distinct machine track IDs were produced.
- `averageTrackDurationMs` - mean lifespan of a track.
- `idSwitches` - count of times a ground-truth identity's continuous presence was represented by
  more than one machine track ID.
- `fragmentations` - the subset of ID switches where the ground-truth person was continuously
  present through the gap (no real absence - occlusion, exit-and-return - to explain the new
  track ID). A fragmentation is a track bug; a legitimate re-identification after a genuine
  absence is not counted as one.

## Input shape

`TrackSpan` (machine-produced: trackId + ordered timestamps) vs. `GroundTruthIdentitySpan`
(human-reviewed: a real person's real continuous presence, with any genuine absence windows
marked explicitly) - the function does not infer absence from gaps in the machine data, since
that's exactly the thing under test.

## Current empirical status

Never run against real data - zero `VisionTrack` rows exist, and no ground-truth identity spans
have ever been created by a human reviewer, because there is no tracked footage to review. See
`VISION_EMPIRICAL_BENCHMARK.md`.
