# Game Video Registry

G.21, Part V-VI. `GameVideo` model + `/games/[fixtureId]/video` (`vision:manage`).

## Reuses MediaAsset - no second file-storage system

Audited before building (Part IV's own instruction): `MediaAsset` already supports arbitrary
`mimeType`, `CLOUDFLARE_OBJECT_STORAGE` as a provider (so a video never has to live on the
application server), checksums, and a `PROCESSING` status. `GameVideo` only adds video-specific
metadata (source type, duration, frame rate, resolution, recording start time, camera label) and
the Fixture/Game association - it has a required, unique `mediaAssetId` foreign key, never a
parallel storage path.

## Registration workflow actually built: existing MediaAsset only

Part VI lists three possible workflows: register an existing MediaAsset, upload via the existing
media pipeline, or associate an externally hosted video. This track built the first one only.

**Why the upload pipeline wasn't extended**: audited `uploadMediaAsset()`
(`src/lib/media-storage.ts`) before assuming it could be reused - it unconditionally calls
`validateImageFile()` (image/jpeg, /png, /webp only) and runs every upload through `sharp` for
variant generation. Video files need a genuinely different path (no image validation, no sharp
processing, and realistically a presigned-direct-to-storage upload rather than a Next.js request
body, since video files are typically far larger than this app's other media). Building that
properly is a real, separate feature - and with zero video assets existing in this environment to
validate it against, building it now would be exactly the "implies production-ready" risk Part IX
of the safety rules warns about. Deferred and disclosed, not silently skipped.

**How to register a video today**: upload the file to Cloudflare object storage through whatever
means is available (the existing R2 tooling, or a future dedicated flow), create the resulting
`MediaAsset` row (mimeType must start with `video/`), then use `/games/[fixtureId]/video` to
associate it with a fixture by MediaAsset id.

## Never auto-analyzes

Registering a video only creates a `GameVideo` row with `visionCapability: VIDEO_REGISTERED`.
Queuing an analysis run is a separate, explicit action on the fixture vision workspace
(Part VI: "Do not automatically run AI analysis on upload unless explicitly requested").

## Metadata fields

`sourceType` (FULL_GAME/CAMERA_ISO/BROADCAST_PROGRAM/PHONE_RECORDING/TRAINING_CLIP/
HIGHLIGHT_CLIP), `durationSeconds`/`frameRate`/`resolutionWidth`/`resolutionHeight` (all nullable
- filled in once actually known, never guessed), `recordingStartedAt` (real-world time recording
began - distinct from "video time," which every timeline anchor is expressed in), `cameraLabel`,
`analysisEligible` (an operator can register a video without ever queuing it for analysis).

## G.22 update: ingest status + real metadata probe

`GameVideo` gained `ingestStatus` (`REGISTERED → PROBING → PROBE_FAILED | READY_FOR_ALIGNMENT →
PROXY_GENERATING → PROXY_FAILED | READY_FOR_ANALYSIS`), `codec`/`container`/`hasAudio`/`probedAt`/
`probeError`. These are populated by `probeVideoFile()` (`media-probe.ts`), a real (not stubbed)
`ffprobe` wrapper - see `VIDEO_INGESTION_PIPELINE.md` and `VIDEO_TECHNICAL_METADATA.md` for the
full detail, including the confirmed absence of `ffprobe` on both this deployment's server and
the local dev machine. Registration itself (the one working workflow described above) is
unchanged this track.
