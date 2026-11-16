# Vision inference on GPUs (v37 design)

Status: **design only.** No code in this streak. The VPS CPU path is measured and finished: **0.016 fps** (≈61 s per inference) on a
6-core host already running Supabase, Postgres, Kong, Studio and the web app at load average 34. That is roughly 1/600th of the speed
needed for a 30-minute game to finish in an evening, and no amount of tuning closes that gap.

Two paths stay in the product, and they serve different jobs.

## Path A — desktop sidecar (unchanged, ships today)

The coach's laptop runs `ultraos-vision-engine.exe` on 127.0.0.1:8011, the agent supervises it, observations queue in SQLite and sync
through `/api/vision/sync` with the signed agent token. 8–16 cores, no contention, a GPU on the machines that have one.

- **Cost**: zero per game.
- **Works offline** for processing; registration and sync need the network.
- **Limit**: a laptop CPU without a dedicated GPU still takes hours for a full game. This is the coach workflow, and it is the one
  that must keep working.

## Path B — cloud GPU via Fal.ai (v37)

The VPS stops doing inference and becomes a dispatcher for someone else's GPU.

```
1. Upload       coach → app.neonultra.ng /api/vision/upload → R2 (already the storage layer)
2. Register     MediaAsset + GameVideo + VisionAnalysisRun (exists today)
3. Dispatch     worker → Fal.ai: submit a job with the video URL (R2 presigned) + model config
4. Await        Fal runs YOLOv8 (or a larger model, which is now affordable) on a GPU
5. Collect      webhook, or polling the job status if a webhook is awkward
6. Persist      write VisionObservation / VisionTrack rows exactly as the CPU analyzer does today
7. Review       unchanged: /vision/games/[fixtureId], confirm/reject, audit log
```

Design constraints that matter more than the happy path:

- **Idempotency.** Fal can retry and webhooks can arrive twice. Observations get deterministic ids derived from
  `(analysisRunId, frame, track)` so `ON CONFLICT DO NOTHING` makes a replay a no-op — the same rule the desktop sync already follows.
- **Failure is a state, not a hang.** A run that Fal never reports on must fail after a deadline and record why, or the queue backs up
  exactly as it did on CPU.
- **The video never becomes public.** Submit a presigned URL with a short TTL, not the public object.
- **No secrets in the desktop app.** The Fal key lives in the VPS env only; the desktop path never touches it.
- **One writer per run.** The VPS writes cloud-run observations; the desktop writes local ones and syncs them. They must not both
  write the same run.

## Cost model (the reason this is worth doing)

A 30-minute game is ~54,000 frames at 30 fps. On a GPU at ~100 fps decoding-and-detecting, that is ~9 minutes of compute.

| quantity | value |
| --- | --- |
| compute per game | ~540 s |
| price (order of magnitude, verify before committing) | $0.0005 / s |
| **cost per game** | **~$0.27** |
| 1,000 games | ~$270 |
| 10,000 games | ~$2,700 |

Compare with a GPU VPS: even the cheapest single-GPU instance is hundreds of dollars a month whether or not a single video is
processed. Per-game pricing is what makes "free AI highlights" plausible as a paid-tier feature rather than a cost centre.

Two things must be measured before that table is quoted to anyone: Fal's actual per-second price for the model we choose, and the real
wall-clock time for our clip length on their hardware. The estimate above is arithmetic, not a quote.

## What v37 needs, in order

1. A Fal job client with retry, deadline and idempotent persistence.
2. A webhook endpoint (or a poller) that finalises runs and writes observations.
3. A kill switch: `VISION_INFERENCE_MODE = desktop | cloud | off`, so the VPS never silently falls back to CPU.
4. One benchmark on real footage: seconds of Fal compute for a 10-minute clip, and the observation count, so the cost table above can
   be replaced with a measurement.

## What this does not change

`vision-beat` stays **disabled** on the VPS. Re-enabling it re-queues every `READY_FOR_ANALYSIS` video on a timer, which is how eight
runs accumulated for one clip. The poller was written for a worker that could keep up; on this host it cannot.


## What was measured (2026-11-16), and what blocked us

| claim | reality |
| --- | --- |
| "Fal hosts YOLOv8" | **False.** `fal-ai/yolov8`, `yolov8n`, `yolo`, `yolo-world`, `object-detection`, `person-detection`, `grounding-dino` all return 404 `Application "…" not found`. The catalogue (`GET api.fal.ai/v1/models`) surfaces image/video generation models for "yolo", "detection" and "segment" — no hosted person detector. |
| our key works | **True.** `FAL_KEY` (72 chars, from `cred/Ultrafal_env.txt`) authenticates against the API; `fal-ai/florence-2-large` accepted a queue submission (200 `IN_QUEUE`), which is how the 404s were distinguished from auth failures. |
| we can deploy our own app | **Blocked.** `fal deploy handler.py::UltraOSVision` fails with `Insufficient permissions: Please visit https://fal.ai/dashboard/serverless-get-started to request access.` That is an account gate, not a code defect. |

Our app is written and in the repository: `services/vision/fal_app/handler.py` (class `UltraOSVision`, `GPU-L4`, `max_concurrency=1`,
bundling `app/analyzer`), plus pinned `requirements.txt`. The moment access is granted it is one command:

```bash
cd services/vision/fal_app && fal deploy handler.py::UltraOSVision --app-name ultraos-vision
```

Then `app/core/fal_client.py` needs its `FAL_VISION_MODEL` pointed at the returned endpoint. Nothing else changes: persistence, the sync
contract and the review UI already expect the shape this handler returns.

**Deliberately rejected**: Florence-2 and other hosted foundation models. Different observation shape (one schema change ripples through
desktop sync, VPS persistence, review UI and highlight generation), per-call pricing that breaks the ~$0.27/game estimate, and detection
quality tuned for stills rather than multi-object tracking.

## Cost Model (To Be Measured)

The **$0.27 per game** figure in this document is an **estimate**, not a measurement:

- it assumes roughly 540 GPU-seconds per game at ~$0.0005/GPU-second;
- it assumes ~100 fps decode-and-detect on an L4/A10G for the nano model at 640px;
- **nothing has been billed yet.** No Fal job has ever run, because deploying our own app is gated behind
  <https://fal.ai/dashboard/serverless-get-started>.

The first real number comes from the 10-second test clip (`…/vision-tests/fal-test-clip.mp4`, 39.7 MB, 120 s of 640x360 @ 30 fps):

1. deploy, then submit through `app.scripts.test_fal_vision`;
2. record submit→complete wall clock and the observation count;
3. record the GPU-seconds and cost from the Fal dashboard for that job;
4. **only then** scale to a full game.

**Tier decision rule**: if the measured cost per clip is more than **3×** the estimate above, revisit the GPU tier (L4 vs A10G) before
quoting anything. The nano model is compute-bound at 640px, so moving up to an A100 would raise cost without lowering latency.

**Full-game extrapolation is a scaling of a measured per-clip cost, not a promise.** A 30-minute game is 30 clips of 120 s, so it is
linear only if per-job overhead (container start, download) stays small relative to inference. That is another thing the first
measurement will show.

### Before promising cost to LBCL or any partner

- [ ] measured on the 10-second clip (GPU-seconds and cost from the dashboard)
- [ ] extrapolated to 30 minutes with the measured per-clip figure, overhead included
- [ ] confirmed against the Fal dashboard invoice, not the estimate table
