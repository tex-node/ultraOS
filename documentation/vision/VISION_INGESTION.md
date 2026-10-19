# Ingesting a game video (I4 readiness)

Status: **infrastructure ready, no footage yet.** There are 0 `GameVideo` rows in staging and production
(checked 2026-10-18), and the vision service (`services/vision`, Phase B0) has no model - its analyzer is
a deterministic stub that emits zero observations. This document is the runbook for the moment a real
video exists.

## One command

```bash
cd /opt/ultraos-staging/current/web
set -a; . /opt/ultraos-staging/shared/web.env; set +a

node --conditions=react-server --import tsx scripts/vision-ingest.ts \
  --file /root/footage/ultra-vs-lxb-2026-09-18.mp4 \
  --fixture <fixtureId> \
  --organization <orgId> \
  --actor <userId> \
  --camera "Baseline camera" \
  --source PHONE_RECORDING
```

It refuses to do anything destructive, and it is safe to re-run: the same file (same sha256) on the same
fixture is detected and skipped.

## What it does, in order

1. **Probe** with `ffprobe` (`-show_format -show_streams`): duration, width/height, frame rate, codec.
   Fails loudly if there is no video stream - a mislabelled audio file does not become a GameVideo.
2. **Copy** the file into local media storage under
   `<MEDIA_LOCAL_ROOT>/originals/<organizationId>/video/<sha256>.<ext>` (staging root:
   `/opt/ultraos-staging/shared/media`). The copy, not a move: the operator's source file is left alone.
   A production deployment would upload to R2 and record only the object key.
3. **Register** two rows in one transaction: a `MediaAsset` (purpose `GAME_VIDEO`, checksum, byte size,
   dimensions, uploaded-by) and a `GameVideo` (fixture, source type, duration, fps, resolution, camera
   label, `ingestStatus = READY_FOR_ANALYSIS`), plus an `GAME_VIDEO_INGESTED` audit entry.
4. **Ask the worker to analyse it**: `POST {VISION_WORKER_URL}/analyze` with
   `{game_video_id, organization_id, requested_by_id}` - the B0 endpoint that creates a
   `VisionAnalysisRun` and dispatches the Celery task
   (`services/vision/app/api/analyze.py`). Default URL `http://127.0.0.1:8010` (the compose file's own
   `VISION_API_PORT` default is 8000, but **port 8000 on this host is an unrelated Kong gateway** - see
   the finding below), overridable with
   `--worker` or `VISION_WORKER_URL`.

## What "success" looks like today, and what does not

| Step | Today | Notes |
| --- | --- | --- |
| probe | works | ffprobe is installed on the host |
| store + rows | works | verified with a 5-second synthetic clip (below) |
| worker call | **fails, by design** | no vision worker is running on the host (port 8000 is Kong, and returns 401); the script reports the status with a hint and leaves the row `READY_FOR_ANALYSIS` |
| analysis | **BLOCKED_NO_REAL_VIDEO** | the B0 analyzer emits zero observations even when it runs |

The row is the durable state, not the HTTP dispatch: `services/vision`'s beat poller picks up
`READY_FOR_ANALYSIS` videos, so a worker that comes up later still finds the video.

## Finding: port 8000 on this host is NOT the vision service

While testing, `http://127.0.0.1:8000/analyze` answered **401 Unauthorized** with `Server: kong/3.9.1`
and `WWW-Authenticate: Basic realm="service"`. Port 8000 on the staging host is an **unrelated Kong
gateway**, not the B0 worker. That is why the script's default is now `:8010`, and why a 401 is reported
with that hint instead of looking like a vision-service auth bug. When the worker is started, either set
`VISION_API_PORT` to a free port or point `VISION_WORKER_URL` at it.

## Bringing the worker up (when there is a model)

```bash
cd /opt/ultraos-staging/current/services/vision   # or the repo copy
cp .env.example .env   # set DATABASE_URL (read-only is enough), REDIS_URL, VISION_STORAGE_*
VISION_API_PORT=8010 docker compose up -d api worker beat
curl -s localhost:8010/health
```

Then re-run the `POST /analyze` half only (the video is already registered):

```bash
curl -s -X POST localhost:8000/analyze -H 'content-type: application/json' \
  -d '{"game_video_id":"<id>","organization_id":"<org>","requested_by_id":"<user>"}'
```

## What happens after `vision-ingest.ts` runs, exactly (2026-10-19)

The most common question about this pipeline is "I ran it - what now?". The answer has four stages, and only
the first is synchronous.

| stage | who does it | when | where it shows |
| --- | --- | --- | --- |
| 1. file + rows | `vision-ingest.ts` (same process) | immediately | `MediaAsset`, `GameVideo` (`READY_FOR_ANALYSIS`), an audit row; the CLI prints the ids |
| 2. `POST /analyze` | the CLI, best effort | immediately, **optional** | a `VisionAnalysisRun` row in `QUEUED` (the worker creates it) |
| 3. run the analysis | Celery worker | **within 5 minutes** if the stack is up | run goes `QUEUED → PROCESSING → COMPLETED`/`FAILED`, `VisionObservation` rows appear |
| 4. human review | an operator | whenever they look | `/vision/games/<fixtureId>` → Confirm/Reject per observation |

**Does it poll automatically?** Yes - `vision-beat` runs `poll_ready_videos` **every 5 minutes**
(`crontab(minute="*/5")`), which finds `READY_FOR_ANALYSIS` `GameVideo` rows and enqueues one `analyze_video`
per video. So `vision-ingest.ts` does **not** need a reachable worker: if `POST /analyze` fails it prints a
warning, leaves the row at `READY_FOR_ANALYSIS`, and the next beat tick picks it up (at most 5 minutes later,
plus however long the analysis takes).

**How long does it take?** The poll is the 5-minute ceiling on *discovery*; the analysis itself is bounded by
the video length and the analyzer. The B0 analyzer is the deterministic stub (`VISION_ANALYZER=stub`), so it
returns in seconds and emits **zero real detections by design** - it proves the plumbing, not accuracy. The
`docker compose` stack starts in well under a minute (the image has no torch).

**Where do errors show up?**
- **Upload/probe errors**: `vision-ingest.ts` exits non-zero and prints the ffprobe/media-storage reason; no
  rows are written (it validates before creating anything).
- **`POST /analyze` unreachable**: a one-line `WARNING: worker not reachable at ...` - the ingest still
  succeeds, and the row is picked up by the poller later.
- **Analysis failure**: the run becomes `FAILED` with the exception text on the run row, and the worker logs
  `analyze failed` with the `run_id` (`docker compose logs vision-worker`). The web UI shows the run as
  `FAILED` on `/vision/games/<fixtureId>`; there is no retry - re-queue it.
- **Review errors** (unmatchable player, wrong sport): the review queue is where they surface, as a
  `SKIPPED`-style report or a rejected observation, never as a silent write.

**Starting the stack** (verified on staging 2026-10-19):

```bash
cd services/vision
cp .env.example .env        # DATABASE_URL at minimum; VISION_API_PORT defaults to 8010
docker compose up -d --wait
curl -s localhost:8010/health   # {"status":"ok","analyzer":"stub",...}
docker compose logs -f vision-worker
```

Two readiness bugs were found by doing this rather than assuming it:
1. the image's `HEALTHCHECK` ran in the worker and beat containers too (they serve no HTTP), so they reported
   **unhealthy** while working and `up --wait` never settled - the check now lives on `vision-api` only;
2. `VISION_API_PORT=8000` collided with the Kong gateway on this host, so the API never started - the default
   is now **8010**, the same port the app's `VISION_WORKER_URL` already uses.

## Verification performed (2026-10-19, staging): review queue with mock observations

```
fixture cmuxu4gga00afyxkk1u12rua8 · video cmvewv1cp00011nkkxpw7glu3 · run cmvewv1eu00031nkkuphd3gwf
model MOCK-DETECTOR@0.0.0-mock · observations: shot=…, rebound=…
GET /vision/games/<fixtureId> -> 200 (33,240 bytes): the run lists "2 observation(s)" and the analysis section
confirm/reject through the page's own reviewObservation service:
  statuses now CONFIRMED / REJECTED · 2 new audit rows
PASS
```

The mock data was then removed with `vision-mock-run.ts --cleanup`: `videos=0 runs=0 observations=0`.

## Verification performed (2026-10-18, staging)

A 5-second synthetic clip was created with `ffmpeg` and ingested end to end:

```
ffmpeg -f lavfi -i testsrc=size=1280x720:rate=25 -t 5 -pix_fmt yuv420p /tmp/dummy-game.mp4
node ... scripts/vision-ingest.ts --file /tmp/dummy-game.mp4 --fixture ... --organization ... --actor ...
  probe:     5s Â· 1280x720 Â· 25 fps Â· h264
  gameVideo: <id> (READY_FOR_ANALYSIS)
  WARNING: worker not reachable at http://127.0.0.1:8000 ...
```

The `GameVideo` row, the `MediaAsset` row, the stored file and the audit entry were all verified; the
review page (`/vision/games/<fixtureId>`) then listed the video. The worker step correctly reported that
no worker is running - it was not faked.

## Limits / next steps

- **No model.** Even with the worker up, B0 emits zero observations. Detection and tracking are B1/B2.
- **No real upload path for large files.** A 2 GB game over `scp` + copy doubles the disk usage; the
  production path should upload to R2 and write the key, not copy locally.
- **No timeline alignment.** `VideoTimelineAnchor` rows (mapping video time to game clock) are created in
  the review UI; without a real video there is nothing to anchor.
- **Celery + Redis are not running on this host.** `services/vision` ships a docker-compose for them.
