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
