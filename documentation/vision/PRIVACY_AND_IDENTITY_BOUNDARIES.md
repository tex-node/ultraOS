# Privacy and Identity Boundaries

G.21, Part LXVII-LXVIII, XXXIV. What this domain will not do, and why.

## No biometric identity

**No facial recognition, no face embeddings, anywhere in this track.** Player identity for a
vision candidate is resolved entirely from contextual evidence - team, jersey number, current
lineup (via G.17's real lineup reconstruction), and track continuity - never from a face model.
See `PLAYER_TRACKING_FOUNDATION.md`. If a future track ever considers biometric identity, the
safety rules require that get its own explicit product/legal/privacy review before any code is
written - this track does not open that door even as an "extension point."

## Vision data is authenticated-only

Every vision route (`/games/[fixtureId]/video`, `/vision`, `/vision/games/[fixtureId]`) requires
`vision:manage`, granted only to `SUPER_ADMIN`/`LEAGUE_OPERATOR` - the same narrow operator group
that already holds `broadcast:operate`. No public route in this track reads from `GameVideo`,
`VisionObservation`, `VisionTrack`, or any other vision table. Public analytics (the API v1
surfaces built in G.20) consume only derived, verified basketball intelligence - never raw
internal AI review data (Part XXXIV's own instruction).

## Video/frame privacy

Game video is treated as potentially sensitive media, same tier as any other roster-linked media
in this system - registered as `MediaAssetPurpose.GAME_VIDEO` with `MediaVisibility.PRIVATE` by
default (reusing MediaAsset's existing visibility model, never a public one). No route in this
track exposes an analysis frame or bounding-box crop publicly, and none was built to do so.

## Dataset export: not built, and scoped narrowly for when it is

Part XXXIII describes a privacy-safe evaluation dataset export (fixture/video/timestamp/period/
clock/event type/team/player public id/prediction/match status - explicitly never faces/frames
unless a user explicitly requests that specific dataset and consent/rights policy permits it).
No export endpoint exists yet in this track - `vision-evaluation.ts`'s pure functions produce the
metrics that such an export would eventually serialize, but no route serializes them today. When
built, it must use the same public-safe identifier discipline the G.20 API already established
(`ultraAthleteId`, never a raw internal id) and must never include frame images by default.

## Storage secrets

`GameVideo` never stores a raw storage credential or an unexpired signed URL directly - it points
at a `MediaAsset`, which already owns the existing signed-URL/expiring-link convention this
codebase established for every other media type. No new URL-signing logic was introduced.

## G.22 update: the dataset export this document scoped is now built

`buildEvaluationDatasetExport()`/`datasetExportToJsonl()` + `GET /api/vision/games/[gameVideoId]/
export` (see `VISION_DATASET_EXPORT.md`) implement exactly the narrow scope this document
described: `fixtureId` (public routing id) and `ultraAthleteId` (never a raw internal id) only -
no faces, no frame images, no raw internal cuids. The route still requires `vision:manage` (not
public) - it is an internal analysis tool, not a public dataset release. No biometric identity
work was added this track either; `PLAYER_TRACKING_FOUNDATION.md`'s context-only identity
resolution (team/jersey/lineup) is unchanged.
