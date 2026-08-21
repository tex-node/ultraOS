# Canonical Event Alignment

G.21, Part XXIV-XXVI. `src/lib/vision/canonical-event-alignment.ts` (pure) +
`src/lib/vision/vision-match-confidence.ts` (pure) + `VisionEventMatch` + `findAlignmentCandidates()`
in `vision-loader.ts`.

## Never a blind full-video search

For a canonical `GameEvent` (a real, human-verified event with a period/game-clock position),
`computeAlignmentWindow()` maps that game-clock position to a video-time window via the timeline
model (`gameTimeToVideoTime()` - see `VIDEO_GAME_TIMELINE_SYNC.md`), padded by a tolerance
(default 1500ms, `DEFAULT_TEMPORAL_TOLERANCE_MS`). Only observations already inside that window
are ever considered - Part XXIV's own explicit instruction ("Do not search the whole video
blindly for a known event").

## Match confidence: a documented, deterministic score

`scoreMatch()` combines up to five pieces of evidence, each independently weighted:

| Evidence | Weight | Notes |
|---|---|---|
| Temporal proximity | 0.35 | Full credit inside tolerance, linear decay to 0 at 2x tolerance |
| Team match | 0.20 | A confirmed mismatch is disqualifying (forces `NO_MATCH`), not just a low score |
| Player match | 0.25 | |
| Event type match | 0.15 | A confirmed mismatch is also disqualifying |
| Shot result match | 0.05 | Made vs. missed, when both sides have a result |

An unknown/unavailable factor (`null`) contributes nothing - absence of evidence is not evidence
of absence. The result is a `MATCH SCORE` (0-1) plus a calibrated band
(`STRONG_MATCH ≥0.75 / POSSIBLE_MATCH ≥0.4 / AMBIGUOUS >0 / NO_MATCH`) - never presented as opaque
"AI confidence" (Part XXVI's own instruction). The tolerance and weights are pending real
calibration against an actual analyzed game (none exists yet - see the G.21 final report's
"empirical rehearsal" section); they're documented defaults, not claimed-precise constants.

## VisionEventMatch: correspondence, never forced

One `VisionObservation` may have zero, one, or several `VisionEventMatch` rows against different
canonical events - ambiguity is represented explicitly, never collapsed into a single guess.
`@@unique([observationId, gameEventId])` prevents duplicate match rows for the same pair; it does
not prevent one observation from matching multiple different events (each gets its own row) when
the evidence is genuinely ambiguous.

## Disagreement is recorded, never used to alter canonical truth

If a vision candidate suggests "3PT" for a canonical event the ledger already has as "4PT," this
is exactly the kind of example the safety rules want captured (Part XLIII) - `eventTypeMatch:
false` on the `VisionEventMatch` row, band forced to `NO_MATCH`. Nothing in this pipeline ever
writes back to the canonical `GameEvent`. A disagreement like this is valuable for future model
improvement, and stays visible in the fixture vision workspace's coverage view - it is never
silently discarded.

## G.22 update: a real spatial signal now exists for exactly this disagreement case

`evaluateFourPointSpatialQualification()` (`four-point-spatial-rule.ts`) gives this alignment
pipeline a genuine geometric signal to compare against a canonical 4PT ruling - once a real
`OFFICIAL` `CourtSpecification` exists. Today it always returns `GEOMETRY_UNAVAILABLE`, so no
alignment decision in this codebase has ever actually used it; the extension point is real, the
data behind it is not. `VisionEventMatch`/`VisionObservation` also gained an optional
`failureCategory` field this track (see `VISION_FAILURE_CASES.md`) so a reviewer marking a
disagreement REJECTED can additionally say *why* (e.g. `TIMELINE_ERROR` vs. genuine model error) -
purely additive to the review action described above.
