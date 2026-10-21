# Vision empirical report

**Status: the model is installed and real inference runs end to end. A synthetic circle is not a person, and the
report says so with numbers instead of pretending otherwise.**

Date: 2026-10-21 · streak v13, Prompt 1 · author: the agent that wrote this file

## What changed since the last report

The v12 report ended with a blunt finding: this repository had **no inference at all** — only a `StubAnalyzer` that
returns zero observations, and a `requirements.txt` that declared no torch, no ultralytics, no opencv. That is no
longer true.

| Before (v12) | Now (v13) |
| --- | --- |
| `StubAnalyzer` only | `YOLOAnalyzer`: YOLOv8n person detection + ByteTrack ids, writing `VisionTrack` and `VisionObservation` rows |
| No torch / ultralytics / opencv / lap in `requirements.txt` | All four declared, plus a Dockerfile that installs CPU torch and bakes in the weights |
| Service could not complete a run against the real schema | Three schema bugs found and fixed (below) |

Installed and verified on the staging host:

```
torch 2.14.1+cpu   (cuda False)
torchvision 0.29.1+cpu
cv2 5.0.0
ultralytics 8.4.183
lap 0.5.13
```

**Three real bugs the first live run exposed** — the B0 service could never have completed a run against the deployed
schema:

1. `VisionAnalysisRun` insert omitted `updatedAt` (Prisma's `@updatedAt` is application-level, not a DB default) →
   `NotNullViolation`.
2. `VisionModel` insert named an `updatedAt` column that does not exist on that table.
3. The pipeline's own enum/column assumptions (`MediaStorageProvider`, `MediaAssetPurpose`, `GameVideo.status` vs
   `ingestStatus`) did not match the schema.

## The measurements

Every run below went through the **real worker** (`app.workers.tasks.analyze_video` with Celery eager mode), so the
run lifecycle (`QUEUED → PROCESSING → COMPLETED`) and the observation writes are the production path.

| Input | What it is | Detections | Precision | Recall | Mean IoU | Mean conf |
| --- | --- | --- | --- | --- | --- | --- |
| `circle-clip.mp4` | the v12 synthetic clip: one orange circle crossing the key | **0** | 0 | 0 | — | — |
| `human-clip.mp4` | a flat humanoid silhouette, ~90×280 px | **0** | 0 | 0 | — | — |
| `person-clip.mp4` | **real person pixels** (cropped from Ultralytics' reference photo) moving across the same court | **300** (one per frame, 1 track) | **1.000** | **1.000** | **0.974** | **0.891** |

```
person-clip: run 25fadb72… status=COMPLETED observations=300 tracks=1 meanConfidence=0.891
             frames with a detection: 300 / 300 · frame recall 1.000 · frame precision 1.000 · mean IoU 0.974
```

**The circle is not detected, and that is the correct answer.** YOLOv8n is trained on COCO, whose "person" class
looks like a photographed human. Asked with no class filter at all at conf ≥ 0.05, it labels the synthetic silhouette
as **"sports ball" (0.141, 0.076)** and never as a person. Reporting a "detected person" there would have been a
fabrication.

**The harness is proven, though.** The same model, in the same process, on Ultralytics' reference photo:

```
persons detected in the reference photo: 4
  conf 0.866 · 0.853 · 0.825 · 0.261
```

So the zero on the circle is a property of the **input**, not of the pipeline. The third clip closes the gap: real
person pixels, synthetic motion — 300/300 frames detected, one track, IoU 0.974 against ground truth. That is what
"the inference code works" looks like when it is measured rather than asserted.

## What is still not proven

- **Real camera footage.** Every clip here is synthetic composition. Nothing in this report claims accuracy on a
  real broadcast feed, where motion blur, occlusion, camera movement and jersey colours all apply.
- **Identity.** The pipeline reports *that* a person was detected and gives a stable track id. It does not say which
  player it is; `VisionTrack.playerCandidatePlayerId` exists but nothing populates it yet.
- **The service over HTTP.** The runs were driven through the worker function in-process, because the FastAPI
  container needs Redis and the media storage adapter. The worker code path is identical, but the HTTP hop is not
  exercised in this report.

## Reproduce

```bash
cd services/vision && . .venv/bin/activate && export DATABASE_URL=<staging> VISION_ANALYZER=yolo
python scripts/generate_synthetic_video.py --out /tmp/circle-clip.mp4 --figure circle
python scripts/generate_person_clip.py --source /tmp/bus.jpg --out /tmp/person-clip.mp4
python scripts/run_vision_pipeline.py --video /tmp/person-clip.mp4 --label person
```

The first command reproduces the negative result; the third reproduces the positive one.
