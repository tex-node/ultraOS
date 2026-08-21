# Video Technical Metadata

G.22, Part X. `GameVideo`'s technical fields + `media-probe.ts`.

## Fields, and where each one comes from

| Field | Source | Populated by |
|---|---|---|
| `durationSeconds`, `frameRate`, `resolutionWidth/Height` | `ffprobe` (or operator manual entry) | `probeVideoFile()` + `setGameVideoIngestStatus()` |
| `codec`, `container`, `hasAudio` | `ffprobe` | same |
| `byteSize`, `checksumSha256` | Already on the related `MediaAsset` - not duplicated on `GameVideo` | `uploadMediaAsset()` (existing, G.15-era) |
| `probedAt`, `probeError` | Set whenever a probe attempt runs, success or failure | `setGameVideoIngestStatus()` |

## Never trust the browser alone

Part X's explicit instruction: don't rely solely on browser-reported metadata (a `<video>`
element's `duration`/`videoWidth`/`videoHeight` can be wrong or unavailable depending on codec
support, seek state, and browser quirks). `probeVideoFile()` is the one authoritative source this
system defines - it either gets real data from `ffprobe`, or it says so honestly. No UI in this
track reads metadata from an HTML video element and stores it as fact.

## No expensive processing inside a web request

`probeVideoFile()` does real process spawning (`child_process.execFile`) and is designed to run
in `scripts/vision-analyze.ts` or a future dedicated ingest worker - never inside a Next.js page
or API route handler (Part X/L/LXXIII).

## Current state: no real metadata has ever been captured

Zero `GameVideo` rows exist (no video registered). `probeVideoFile()`'s only exercise in this
environment is its own unit test, which confirms the honest-fallback path (ffprobe genuinely not
installed here) rather than the real-probe path (untested against a real file, since none exists).
