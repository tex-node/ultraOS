# Video ↔ Game Timeline Synchronization

G.21, Part VII-XI. `src/lib/vision/video-timeline.ts` (pure, fully unit-tested) +
`VideoTimelineAnchor`.

## Video time and game clock are not the same thing

A video's elapsed milliseconds and the game clock's remaining seconds diverge for real reasons:
recording starts before tip-off, halftime elapses in real time while the game clock is at 0,
stoppages pause the game clock but not the recording. This module never assumes second 0 of
video equals game start.

## Manual anchors first

An operator marks anchor points: "video 00:05:14.220 = Half 1, clock 06:42." Two or more anchors
in the same period let the system interpolate between them and detect drift; anchors are never
assumed to progress at a constant rate across a period boundary (halftime is never bridged as if
it were continuous play).

## Piecewise segments, derived not stored

A segment (a linear video-time-to-game-clock mapping between two consecutive same-period anchors)
is computed at read time from the anchor list, never persisted as its own row - storing it
separately would just be a second copy that could silently drift from the anchors it came from.
See `buildSegments()`.

## Confidence is always reported, never hidden

Every mapping returns one of: `EXACT_ANCHOR` (landed exactly on a marked point),
`INTERPOLATED` (between two anchors, linearly), `LOW_CONFIDENCE` (a degenerate anchor pair),
`OUTSIDE_ALIGNED_RANGE` (no segment covers this point - most commonly, no anchors exist yet for
that period), `UNAVAILABLE` (no anchors at all). Nothing downstream ever treats an interpolated
timestamp as if it were exact.

## Drift detection

`detectAnchorDrift()` flags a segment where the implied video duration and the implied game-clock
duration diverge by more than a configurable tolerance (default 5s/minute) - a strong signal that
one of the two anchors was misread (wrong period, misread clock), not that real time genuinely
behaved strangely.

## Auto-detection is a documented extension point, not built

Part XI asks for a workflow: `AUTO-DETECTED ANCHOR -> REVIEW -> ACCEPT -> CANONICAL ANCHOR`. The
schema supports this today - `VideoTimelineAnchor.source` (`MANUAL`/`AUTO_DETECTED`) and
`accepted` (defaults `false` for auto-detected, `true` for manual) already enforce that an
auto-detected anchor cannot participate in real synchronization until an operator explicitly
accepts it (`acceptTimelineAnchor()` in vision-loader.ts). No scoreboard-OCR or broadcast-graphic
reader was built this track (Part XI: "do not overbuild OCR") - the extension point exists, the
detector doesn't.

## G.22 update: unchanged

No schema or logic changes to timeline synchronization this track. `Game.homeAttacksBasketFirstHalf`
(new in G.22, see `ULTRA_COURT_SPECIFICATION.md`) is a related but distinct concept - it derives
which basket a team attacks per period, not when a video frame maps to a game-clock position. The
two combine only inside `four-point-spatial-rule.ts`'s consumers, never inside this module.
