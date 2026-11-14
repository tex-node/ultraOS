# Vision sidecar contract

The standalone vision engine (`ultraos-vision.exe`) that the desktop app downloads and supervises. It is a **local, loopback-only
process**: it receives a file path, returns observations, and never talks to the database or the server.

Status: **specification only.** The binary is not built yet, and no artifact is hosted. This document exists so the PyInstaller
build targets a known interface instead of one invented at packaging time.

## Transport

- Binds `127.0.0.1:8011` only. Never `0.0.0.0`, never a public interface.
- **No authentication header.** The only client is the desktop agent, which controls the subprocess and the loopback interface. The
  boundary is the port the agent opened, not a shared secret: a token here would be a secret in the same process tree as the thing
  it protects.
- Owned by the agent: `START_VISION_SIDECAR` spawns it, `STOP_VISION_SIDECAR` terminates it, and it must exit if the agent dies
  (supervision is the agent's job; the sidecar should not outlive its parent).

## `GET /health`

```json
{ "status": "ok", "model": "yolov8n-person", "version": "<git sha>", "uptime_seconds": 42 }
```

The agent polls this every 5 s for up to 30 s after spawning. Anything other than `status: "ok"` within that window is a failed
start, and the agent kills the process and reports its captured stderr.

## `POST /analyze`

```json
{
  "videoPath": "C:\\Users\\…\\Videos\\match.mp4",
  "gameVideoId": "cm…",
  "analysisRunId": "cm…",
  "calibration": { "courtCorners": [[0,0],[1,0],[1,1],[0,1]] }
}
```

```json
{
  "observations": [
    {
      "id": "<uuid>",
      "videoTimeMs": 12500,
      "videoTimeEndMs": null,
      "observationType": "PLAYER_DETECTION",
      "boundingBox": { "x": 0.41, "y": 0.33, "width": 0.05, "height": 0.12 },
      "courtX": null,
      "courtY": null,
      "teamCandidateSeasonClubId": null,
      "playerCandidatePlayerId": null,
      "confidence": 0.87,
      "trackId": null
    }
  ],
  "error": null
}
```

Rules the agent depends on:

- `id` is stable for a given (run, track, frame). The server upserts with `ON CONFLICT (id) DO NOTHING`, so a retried sync is not a
  duplicate.
- `confidence` is required and is a real model score. The server schema rejects a row without it; a defaulted `1.0` would be a
  fabricated measurement.
- An error is reported in `error` with HTTP 200 and an empty `observations` array, or as a non-2xx for transport failures. The
  agent treats both as "no observations" and keeps the file queued.
- `analysisRunId` and `gameVideoId` are passed through untouched; the sidecar does not validate them and cannot, because it has no
  database access.

## `POST /cancel`

```json
{ "jobId": "…" }
```

```json
{ "cancelled": true }
```

## The constraint that shapes the flow: this is not fully offline

`VisionObservation` requires `analysisRunId` and `gameVideoId`, both foreign keys to rows created by the server-side upload
pipeline. A laptop therefore cannot process a video from a cold start:

1. **Register the video** server-side (`/api/vision/...` creates `GameVideo` + `VisionAnalysisRun`), which returns both ids.
2. **Process locally** — the sidecar analyses the local file.
3. **Sync observations** — the agent posts them to `/api/vision/sync`, which scopes the insert to the org in the agent token.

If the network is down at step 1, the desktop app must **queue the file for later registration**, not process it and then fail to
sync. That queue is not implemented (Prompt 5c-iii).

## Divergence from the current service

`services/vision/app/main.py` exposes `/health` and `/analyze`, but its request and response schemas are **not** this contract:

| | current service | this contract |
| --- | --- | --- |
| `/health` body | `{status, analyzer, database_configured, storage_configured}` | `{status, model, version, uptime_seconds}` |
| `/analyze` request | `{game_video_id, organization_id, requested_by_id}` | `{videoPath, gameVideoId, analysisRunId, calibration}` |
| `/analyze` response | `{run_id, status}` — a queued job | `{observations, error}` — the detections |
| DB access | yes (`database_configured`) | none; the sidecar is inference-only |
| `/cancel` | absent | required |

The packaged sidecar therefore cannot be a thin wrapper around the current service: the existing one is a **server-side job
dispatcher** that talks to Postgres and returns a run id, while the desktop needs a **stateless inference worker** that takes a path
and returns observations. Those are different programs. Building the desktop bundle means either extracting the inference core
(`app/core/analyzer.py`) into a new entrypoint, or running the current service in a mode where it has no database — the first is the
honest option, and it is part of 5c-ii's cost.

## Implementation status (2026-11-14)

| piece | state |
| --- | --- |
| `app/analyzer/` pure detection | implemented, static isolation test green |
| `app/core/analyzer.py` wrapper | delegation only; persistence untouched (see git diff) |
| `app/sidecar_main.py` | implemented; contract test green |
| parity sidecar vs dispatcher | **UNVERIFIED** — requires torch + weights + DB |
| `.exe` bundle | not built (Prompt 5c-ii-c) |

Pinned weights: `weights/yolov8n.pt`, SHA256 `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`.

## Build artifact (2026-11-14)

| | |
| --- | --- |
| file | `ultraos-vision-engine.exe` |
| size | **261,157,478 bytes (249.1 MB)** |
| sha256 | `193d2a8f3a84c7a5d9e5d5181ca9cd9f819e0f727cf1277176aa9449632ca5ba` |
| run | `ultraos-vision-engine.exe` (no arguments; binds 127.0.0.1:8011) |
| weights | embedded (`yolov8n.pt`, pinned `f59b3d83…`) |
| inputs | **a local file path**, never a database id — path resolution stays in the dispatcher, not the sidecar |

Parity: sidecar 87 observations vs dispatcher 87, identical — verified on a panned clip containing three people.

**Code signing**: the exe is unsigned. Windows SmartScreen will warn on first run for anyone who receives it by email or USB. Known
gap for the pilot; not a defect to hide, and it is the first thing a real distribution needs.

## Prompt 5c-iii status (2026-11-14)

| piece | state |
| --- | --- |
| hosted engine | 261,157,478 bytes · sha256 `193d2a8f…` · HEAD 200 verified |
| `DOWNLOAD_VISION_ENGINE` | verified: progress, hash pin, 1.0 min on this link |
| `START/STOP_VISION_SIDECAR` | verified: health 200, status flips |
| `VISION_STATUS` | verified, camelCase |
| dispatcher persistence | verified: 87 observations + 3 tracks in the local DB |
| vision tab UI | **not built** |
| observation sync UI | **not built** |

**Known quirk in the published binary**: `/health` reports `weights_loaded: false` because that field checks the current working
directory rather than `sys._MEIPASS`. Inference is unaffected — the bundled engine returned 87 observations on the same clip — and the
fix (`model_path()`) belongs in the next build, which also needs re-uploading and re-pinning.

## Prompt 5c-iv status (2026-11-14)

| piece | state |
| --- | --- |
| `vision_observations` table + 3 actions | **done and verified** (save/read/mark/idempotent/dead-letter) |
| `drainVisionObservations()` | done, wired to the same trigger; **not exercised end to end** |
| `/api/vision/register` | created; not called by anything yet |
| panel states A/B/D | built |
| panel state C upload | **not built** — needs a native file picker bridge |
| full loop to the VPS review page | **not run** |

**DoD status: not met.** The queue, the sync contract and the install/start UI are real; the file-selection bridge is the last
mechanical gap before a coach can process a video, and the review-page confirm path is unexercised.
