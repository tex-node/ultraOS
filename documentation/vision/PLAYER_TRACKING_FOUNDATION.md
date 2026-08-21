# Player Tracking Foundation

G.21, Part XIX-XXIII. `VisionTrack` + `src/lib/vision/player-identity-constraints.ts` (pure,
fully unit-tested) + `scripts/vision-analyze.ts` (the offline POC entrypoint).

## Track ID ≠ player identity

A `VisionTrack` represents "likely the same detected person across a sequence of frames" -
nothing more. `TRACK_0042` may later carry `playerCandidatePlayerId: <a real Player row>`, but
that's always a **candidate** with an `identityConfidence`, never asserted identity. The schema
enforces the naming distinction (`playerCandidatePlayerId`, not `playerId`) the same way
`VisionObservation` does.

## Identity resolution: context, never primarily appearance

Per the safety rules (no facial recognition as the default mechanism, no identity from physical
appearance alone), `resolvePlayerIdentityCandidates()` narrows the candidate player set using:

- **Team** - which club a detected person is plausibly on (from jersey color/side, not face).
- **Jersey number** - a `JERSEY_NUMBER_CANDIDATE` observation (see below), a hard constraint once
  known (a jersey candidate that doesn't match a roster player rules that player out entirely,
  not a soft weighting).
- **Current lineup** - reuses G.17's `deriveLineup()` (never a second lineup engine) to know
  exactly which 5 players per team are actually on court at a given moment; a player not
  currently in the game cannot be who was just observed on court.

When team + jersey + lineup together narrow the roster to exactly one player, `uniqueMatch` is
set - but this is still just a strong candidate for human review, never auto-applied anywhere.
When multiple players remain plausible, every one of them is returned as a candidate rather than
picking a "best guess."

## Jersey number observations

`JERSEY_NUMBER_CANDIDATE` is its own observation type specifically because one OCR read on one
frame is never treated as authoritative - the architecture supports (though this track doesn't
implement the aggregation logic) combining several `JERSEY_NUMBER_CANDIDATE` observations for the
same track across multiple frames before treating a jersey number as reliable.

## The offline proof-of-concept: honestly not run

Part LII recommends starting with player/person detection rather than full basketball-event
understanding. `scripts/vision-analyze.ts` builds the real lifecycle around this (creates a
`VisionModel` + `VisionAnalysisRun`, transitions `QUEUED → PROCESSING`) but this environment has
**zero registered game video** (confirmed: `MediaAsset` has no `video/*` rows) and no
computer-vision inference stack (no Python/CV runtime, no model weights, no GPU). The script
correctly reports `VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO` and marks the run `FAILED` with
that exact, honest reason - never a fabricated `COMPLETED` with zero real detections, which would
misleadingly look like "analyzed, found nothing" instead of "never actually ran." See
`VISION_WORKER_ARCHITECTURE.md` for what a real implementation would plug in at that point.

## Ball detection: not attempted

Part LIII allows ball detection as optional, after player detection, without blocking the track.
Given player detection itself has no real video to validate against, ball detection (harder,
per the track's own note) wasn't attempted either. Same extension point applies.

## G.22 update: real evaluation and filtering functions, still never run

G.22 built the machinery that would score this module's output once real tracks exist:
`detection-metrics.ts` (IoU-based precision/recall/F1), `tracking-metrics.ts` (ID switches,
fragmentations), and `trajectory-filtering.ts` (impossible-jump rejection, median smoothing) - see
`PLAYER_DETECTION_EVALUATION.md`, `MULTI_OBJECT_TRACKING_EVALUATION.md`,
`TRAJECTORY_STORAGE_FORMAT.md`. All are real, unit-tested, and none have ever scored a real
`VisionTrack`, since `scripts/vision-analyze.ts` still reports
`VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO` exactly as it did in G.21 - nothing about this
track's status changed, only the tooling waiting for it did.
