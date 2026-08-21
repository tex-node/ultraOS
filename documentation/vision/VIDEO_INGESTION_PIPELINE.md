# Video Ingestion Pipeline

G.22, Part IX-XV. `GameVideo.ingestStatus` + `src/lib/vision/media-probe.ts` + `/vision/videos`.

## Ingest states

`REGISTERED` (default, on creation) → `PROBING` → `PROBE_FAILED` | `READY_FOR_ALIGNMENT` →
`PROXY_GENERATING` → `PROXY_FAILED` | `READY_FOR_ANALYSIS`. Never advanced by a web request - the
state transitions are real, callable functions (`setGameVideoIngestStatus()` in
`vision-loader.ts`) intended to be driven by an offline worker, exactly like `VisionAnalysisRun`'s
own lifecycle (see `VISION_WORKER_ARCHITECTURE.md`).

## Metadata probe - real, not a stub

`probeVideoFile()` genuinely shells out to `ffprobe` (duration, resolution, frame rate, codec,
audio presence) when it's actually installed. **Confirmed via a direct check against this
deployment's production server as part of G.22's pre-work audit: ffprobe is not installed there**,
and it isn't on the local development machine either. The function's fallback path is real and
tested (`media-probe.test.ts` genuinely exercises the "not installed" branch, not a mock) - it
returns `{ available: false, reason }`, never fabricated duration/codec/resolution values (Part X:
"do not rely solely on browser-reported metadata," which this function doesn't do either - it
simply reports what it honestly cannot determine).

## Why ffprobe wasn't installed as part of this track

Installing a new system package on the live production web server is a meaningfully consequential
infrastructure change, and Part XIII/L's own separation principle argues against putting media
probing on the web server at all - a real ingest worker (a separate process/environment) should
own `ffprobe`, not the Next.js service. With zero real video to probe in this environment either
way, installing ffprobe now would have nothing to prove itself against. Documented as a real,
disclosed gap rather than silently worked around.

## Large file / resumable upload - not built (disclosed in G.21, reaffirmed here)

Part IX explicitly asks for large-file, resumable upload support reusing existing cloud storage.
G.21 audited `uploadMediaAsset()` and found it image-only (unconditional `validateImageFile()` +
`sharp` processing). G.22 did not build a new video upload path either - the same reasoning
applies even more strongly now: building resumable/chunked upload infrastructure with zero real
video files to validate it against would be exactly the kind of "impressive scaffolding for data
that doesn't exist" this track's own priority order warns against (P0 physical truth and P1
real-video acquisition come before P1's "first real vision benchmark," which itself comes before
any polish). **Today's real, working path is registering an existing MediaAsset** (upload the
file to Cloudflare object storage through whatever means available, then register it via
`/games/[fixtureId]/video`) - unchanged from `GAME_VIDEO_REGISTRY.md`.

## Review proxy - architecture only

Part XI's lower-bandwidth review proxy is a real extension point (`ingestStatus:
PROXY_GENERATING`/`PROXY_FAILED`, and `MediaAssetVariant` - already used by images - is the
natural reuse target for a video proxy too, since it already has `name`/`storageProvider`/
`objectKey`/`checksumSha256` fields matching what a proxy variant needs). No proxy has ever been
generated in this environment (no source video, no transcoding tooling installed) - not attempted
this track.

## Real video requirement (Part XIV) - still unmet

Re-confirmed via a direct database check at the start of G.22 (same as G.21's check): zero
`MediaAsset` rows with a `video/*` mimeType exist. The user was asked directly whether real Ultra
Basketball video or official court dimensions were available for this track and confirmed
neither was. See the G.22 final report's classification.
