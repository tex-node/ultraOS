# Human Review Workflow

G.21, Part XXVII-XXVIII, LXI. `/vision/games/[fixtureId]` (`vision:manage`) +
`reviewObservation()`/`reviewEventMatch()` in `vision-loader.ts`.

## Where review happens

The fixture vision workspace (`/vision/games/[fixtureId]`) is the one review console this track
builds - not a separate `/vision/review` route, since Part LIX already describes the fixture
workspace as including "review queue," and a second page would just fragment the same data. It
shows, per selected `GameVideo`: timeline anchors (with accept/pending state), analysis runs,
canonical event match coverage, and two review queues - pending `VisionObservation`s and pending
`VisionEventMatch`es.

## Actions

Observations: **Confirm** (`CONFIRMED`), **Reject** (`REJECTED`), **Mark ambiguous**
(`AMBIGUOUS`). Event matches: the same three, applied to `VisionEventMatch.reviewStatus`. Every
action requires `vision:manage` and is attributed to the acting user.

## What's not built: short clips (Part XXVIII)

The track allows a fallback: "if video clipping infrastructure does not exist, show frame/
timestamp first. Do not overbuild transcoding in this track." No video clipping/transcoding
infrastructure exists in this codebase, and building one specifically to preview clips that don't
exist yet (no video registered) would be exactly that overbuilding. The review queue shows
frame/timestamp (`videoTimeMs`) and structured candidate fields today; a `-3s/+3s` clip preview is
a real future enhancement once real video and a transcoding pipeline both exist.

## Audit trail (Part LXI) - reuses AuditLog, never a second table

Every review action writes an `AuditLog` row (`action: "VISION_OBSERVATION_REVIEWED"` or
`"VISION_EVENT_MATCH_REVIEWED"`, `entityType`/`entityId` pointing at the reviewed row,
`details: { previousStatus, newStatus, reason }`) inside the same transaction as the status
update - the prior status is read before the write, so the audit entry captures a genuine
before/after, not just the new state. This reuses the existing `AuditLog` model unchanged
(Part LXI: "reuse AuditLog where appropriate. Do not allow silent manual relabeling") rather than
introducing a dedicated `VisionReview` table that would just duplicate what `AuditLog` already
does well.

## What review does NOT do

Confirming an observation or a match never writes anything to `GameEvent`, `PlayerStat`,
`TeamStat`, or `Standing` - it only changes the vision-domain row's own status. Promoting a
confirmed vision signal into canonical truth is a distinct, more consequential action this track
deliberately does not build (see `AI_VISION_ARCHITECTURE.md`'s "one rule" section).

## G.22 update: failure categorization added to the same review action

Rejecting or marking an observation/match ambiguous can now additionally set a `failureCategory`
(`FALSE_POSITIVE`/`FALSE_NEGATIVE`/`ID_SWITCH`/`BAD_CALIBRATION`/`JERSEY_ERROR`/`TIMELINE_ERROR`/
`OCCLUSION`/`AMBIGUOUS` - see `VISION_FAILURE_CASES.md`), surfaced cross-fixture at
`/vision/failures`. This is an additional optional field on the existing review action, not a new
workflow or a second approval step - `AuditLog` capture is unchanged. Clip preview (Part XXVIII's
noted gap) is still not built - see `VISION_REVIEW_CLIPS.md` for why G.22 also left it
architecture-only.
