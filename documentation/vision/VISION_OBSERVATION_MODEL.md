# Vision Observation Model

G.21, Part XII-XIII. The central architectural boundary of the whole vision domain -
`VisionObservation`, `VisionTrack`, `VisionAnalysisRun`, `VisionModel`.

## Every field is a candidate, never truth

`VisionObservation.playerCandidatePlayerId`, `teamCandidateSeasonClubId`,
`jerseyCandidateNumber`, and `eventCandidateType` are all explicitly named "candidate" in the
schema - not `playerId`/`teamId`/`eventType`, which would look identical to a canonical
`GameEvent`'s real fields and invite confusion. **A `CONFIRMED` VisionObservation is still not a
GameEvent** - `status: CONFIRMED` means a human reviewer looked at this specific observation and
agreed it's real, not that it has been promoted into canonical truth. Promoting a reviewed
observation into an actual `GameEvent` (or into `GameEvent.x`/`y`/`courtZone`) is a distinct,
more consequential action this track deliberately does not build - it would need its own explicit
audit trail and safety review, out of scope for a foundation track.

## Observation types (only what's actually implemented)

`PERSON_DETECTED`, `PLAYER_TRACK`, `BALL_DETECTED`, `SHOT_ATTEMPT_CANDIDATE`,
`SHOT_MADE_CANDIDATE`, `REBOUND_CANDIDATE`, `PASS_CANDIDATE`, `COURT_POSITION`,
`JERSEY_NUMBER_CANDIDATE`. Deliberately not exhaustive of every future basketball event
(Part XII: "do NOT name every future basketball event in v1 unless actually implemented") - a
future track can extend this enum additively when it actually builds detection for a new type.

## Status lifecycle

`PENDING` (default, awaiting review) → `CONFIRMED` / `REJECTED` / `AMBIGUOUS` (human review, see
`HUMAN_REVIEW_WORKFLOW.md`) / `MATCHED` (has at least one associated `VisionEventMatch`).

## AnalysisRun: reproducibility, never silent mutation

Every model execution is one `VisionAnalysisRun` row (`gameVideoId`, `visionModelId`,
`configHash`, `requestedById`, `startedAt`/`completedAt`, `observationCount`, `status`:
`QUEUED → PROCESSING → COMPLETED|FAILED|CANCELLED`). A model upgrade or re-analysis creates a
**new** run - an old run's observations are never edited or reattributed to a different model
version. This is what makes a later evaluation report meaningfully comparable to an earlier one.

## Model Registry: identity only, not an ML platform

`VisionModel` (`key`, `version`, `description`, `configHash`) is deliberately minimal - Part XV's
own instruction ("do not build an ML platform. Just preserve model identity/version/
configuration"). `ensureVisionModel()` upserts by `key`, so re-running the same model doesn't
create duplicate registry rows.

## Tracks are temporal identity, not player identity

See `PLAYER_TRACKING_FOUNDATION.md` for the full detail on `VisionTrack` - the short version is
`TRACK_0042` is never the same thing as a real player, even when `playerCandidatePlayerId` is
set, until a human confirms it.
