# Vision Worker Architecture

G.21, Part XLVIII-LI, LXXIII. Why computer-vision inference never runs inside the Next.js web
process, and what actually exists today.

## The separation

```
League OS (Next.js web/API, this deploy)  --  Postgres  --  Object Storage (Cloudflare, existing)
                                                                     |
                                                            Vision Worker (NOT built this track)
                                                                     |
                                                             Model Artifacts (NOT built this track)
```

The web process's job is to own the `VisionAnalysisRun`/`VisionObservation`/`VisionEventMatch`
data model and the human review/evaluation UI - never to decode video or run inference
(Part L: "the production web process should not be responsible for GPU inference").

## What exists: the QUEUED → PROCESSING → COMPLETED/FAILED lifecycle

`vision-loader.ts`'s `createAnalysisRun()`/`setAnalysisRunStatus()` own this lifecycle.
`/vision/games/[fixtureId]`'s "Queue analysis run" button only ever creates a `QUEUED` row - it
performs no inference itself (Part XLIX/L). `npm run vision:analyze -- --video=<id>` is the
offline/local entrypoint (Part XLIX's fallback: "If no external worker architecture exists:
build a safe offline/local command first") - it transitions a run to `PROCESSING`, and is the
exact extension point a real pipeline would insert frame decoding + model inference +
`recordObservation()` calls into.

## Why no real worker was built

No GPU environment is available in this deployment (a single Linux VPS running the web service +
Postgres), no video exists to process, and standing up GPU infrastructure with nothing real to
run on it would be exactly the premature deployment Part L warns against ("do not deploy a GPU
stack prematurely if no GPU environment is available"). `scripts/vision-analyze.ts` today honestly
reports `VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO` and marks its run `FAILED` with that reason
- proving the lifecycle works end-to-end without pretending detection happened.

## Model artifact policy (Part LI)

No model weights are checked into this Git repository, now or as a plan for later - `VisionModel`
only stores `key`/`version`/`description`/`configHash` (an identity/reference, never a binary
blob). A future real model's weights would live in object storage or a model registry service,
referenced by `configHash`, with their source/license documented alongside the `VisionModel` row
that references them (not yet needed - no real model exists).

## Performance/scale estimate (Part LXIX) - labeled as an estimate, not a measurement

No real analysis run has ever processed a frame in this environment, so there is no observed
runtime/storage data to report. Order-of-magnitude estimates only, clearly labeled as such:

| Category | Estimate | Basis |
|---|---|---|
| Video size | 2-8 GB/game | Typical 1080p/30fps H.264, ~40-50 min of content |
| Frames/game | ~72,000-90,000 | 30fps × ~40-50 min |
| Detections/game (person, all players+refs) | ~500,000-1,000,000 | ~10-12 people/frame × frame count, before any sampling/downsampling |
| VisionObservation rows/game (if every frame stored) | Same order as detections - this is exactly why `HIGH_FREQUENCY_DATA_STORAGE.md`'s object-storage-for-raw-data decision matters |
| Analysis runtime | Unknown | Entirely dependent on hardware and sampling rate, no real run to measure |

These are sanity-check numbers to motivate the storage architecture decision, not a capacity plan
- do not treat them as validated.

## G.22 update: unchanged

No worker was stood up this track either, for the same reasons as G.21 (no GPU environment, no
real video, standing up infrastructure with nothing to run on it would be premature). G.22's real
addition on this front is `media-probe.ts`'s `probeVideoFile()` - a genuine `ffprobe` wrapper that
*is* meant to run outside the web process (documented in `VIDEO_INGESTION_PIPELINE.md`), confirmed
via direct checks that `ffprobe` is installed on neither this deployment's server nor the local
dev machine. The QUEUED → PROCESSING → COMPLETED/FAILED lifecycle above is unchanged.
