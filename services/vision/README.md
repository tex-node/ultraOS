# Ultra League OS — Vision Service (P14 / Workstream B)

AI vision inference for Ultra Basketball game video. **Observe-only:** this service never writes
canonical scoring data (`GameEvent` / `PlayerStat` / `TeamStat` / `Standing`). See
`documentation/vision/AI_VISION_ARCHITECTURE.md` (the "one rule") and
`documentation/P13_P14_RECONCILIATION.md` (the signed-off boundary decision).

This is **Phase B0**: the service shell, the queue, and the storage adapter. There is **no model**
yet — the analyzer is a deterministic stub that emits zero observations and says so. Real detection
and tracking land in B1/B2.

## Stack (agreed in the reconciliation note)

| Layer | Choice |
| --- | --- |
| Runtime | Python 3.12 |
| API | FastAPI + Uvicorn |
| Queue | Celery + Redis |
| Storage | boto3 adapter (R2/S3), stub in B0 |
| Training / inference | PyTorch 2.x + ONNX Runtime (added in B1/B2) |
| Detector / tracker | RF-DETR-Small (baseline) or YOLOv11-M + ByteTrack (B2) |

## Layout

```
services/vision/
  app/
    main.py                 FastAPI app (/health, /analyze)
    api/                    request/response schemas + routes
    core/                   config, logging, enums, db, storage, analyzer, run lifecycle
    workers/                celery app + tasks (poll_ready_videos, analyze_video)
  tests/                    B0 stub + enum-parity tests
  Dockerfile                Python 3.12 image
  docker-compose.yml        api + worker + beat + redis
  requirements.txt          B0 runtime deps (no torch yet)
  .env.example              config template
```

## Run locally

```bash
cd services/vision
cp .env.example .env         # fill DATABASE_URL + storage creds
docker compose up --build
curl http://localhost:8000/health
```

`/health` reports the analyzer name and whether the DB/storage are configured.

## Queue an analysis

```bash
curl -X POST http://localhost:8000/analyze \
  -H 'content-type: application/json' \
  -d '{"game_video_id":"...","organization_id":"...","requested_by_id":"..."}'
```

This inserts a `VisionAnalysisRun` row (`QUEUED`) and dispatches `analyze_video`, which drives
`QUEUED -> PROCESSING -> COMPLETED | FAILED`. The Celery beat schedule also polls every 5 minutes
for `GameVideo` rows with `ingestStatus = READY_FOR_ANALYSIS`.

**Status note:** the app enum is `VisionAnalysisRunStatus` with `PROCESSING` (not `RUNNING`), and
`GameVideo` has no `UPLOADED` state — the analysis-ready state is `READY_FOR_ANALYSIS`. The service
uses the real enum values.

## Tests

```bash
cd services/vision
python -m pytest -q
```

## What B0 does not do

- No inference, no model weights, no observations written (`VisionObservation`/`VisionTrack` stay
  empty until B2).
- No video segment fetching (the storage adapter's `download_segment` raises until B2).
- No auth on `/analyze` (B1 adds the service-account credential scoped to `Vision*` tables).
