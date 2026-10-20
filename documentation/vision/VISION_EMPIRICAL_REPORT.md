# Vision empirical report

**Status: the asset is proven, the inference is not — because this repository contains no inference.**

Date: 2026-10-20 · streak v12, Prompt 3 · author: the agent that wrote this file

## What was asked

> The Vision pipeline is fully built but `BLOCKED_NO_REAL_VIDEO`. Prove the ML inference works using a synthetic
> video: generate a 10-second clip of a moving orange circle, run it through `vision-ingest.ts` and the FastAPI
> worker, and verify YOLO/ByteTrack detects the circle and logs a `VisionObservation`.

## What is true

**The synthetic clip exists and is verifiable.** `services/vision/scripts/generate_synthetic_video.py` generates a
deterministic 1280×720, 30 fps, 10-second (300-frame) H.264 clip of a half-court with one bright orange circle
crossing the key and one static marker that never moves. It needs only numpy and ffmpeg — not opencv, deliberately:
a generator that shares the analyser's library is harder to trust, not easier. It writes a ground-truth JSON
alongside the video.

```
wrote /tmp/synthetic-court.mp4 (38,710 bytes, 300 frames, 30 fps, 10s)
wrote /tmp/synthetic-court.truth.json (ground truth for the moving and static circles)

container: h264 1280x720 @ 30fps, 300 frames
frame   0: orange centroid 200,520  · expected 200,520  · delta 0,0
frame 150: orange centroid 641,360  · expected 641,360  · delta 0,0
frame 299: orange centroid 1080,520 · expected 1080,520 · delta 0,0

PASS: the clip is the described asset (resolution, frame count and the moving circle's position)
```

`services/vision/scripts/verify_synthetic_video.py` performs that check: ffprobe for the container, then three
decoded frames inspected for the orange circle at the ground-truth position. It does not use a model either, so it
proves the *asset*, not the *inference*.

**The inference does not exist in this repository.** The prompt assumed a built pipeline waiting for video. The code
says otherwise:

| Evidence | What it shows |
| --- | --- |
| `services/vision/app/core/analyzer.py` — only `Analyzer` (ABC) and `StubAnalyzer` | There is no detector and no tracker implementation. |
| `StubAnalyzer.analyze()` returns `observation_count=0` with the note `STUB_ANALYZER: no inference performed; real CV lands in B1/B2.` | The pipeline is designed to emit **nothing** rather than fabricate observations. |
| `services/vision/requirements.txt` — `fastapi`, `uvicorn`, `celery`, `redis`, `psycopg`, no torch/onnxruntime | No inference runtime is declared, so none can be running. |
| `grep -inE "torch\|onnx\|ultralytics\|yolo\|bytetrack\|opencv" requirements.txt` | No matches. The one hit is the comment saying they arrive later. |
| The B0 module docstring: “The real analyzers (RF-DETR/YOLOv11 detector + ByteTrack + OCR + homography) arrive in B1/B2.” | The repository's own statement of the gap. |

Therefore the sentence the prompt asked for — *“verify YOLO/ByteTrack detects the orange circle and logs a
`VisionObservation`”* — **cannot be produced truthfully**. Feeding the clip to the service today would exercise the
`StubAnalyzer` and log **zero** observations with a truthful note. Reporting that as a detection would be exactly the
kind of fabricated output the stub's docstring warns against.

## What can be done with the clip today

1. **It is ready for B1.** When a detector lands, the same command regenerates the asset and the same ground-truth
   JSON becomes the accuracy fixture: a working detector should find one large orange blob whose centroid tracks
   `objects[frame].moving` within a few pixels and should **not** report the static marker as a moving object.
2. **The failure that motivated this work is gone.** `BLOCKED_NO_REAL_VIDEO` is no longer a blocker for development
   or CI: the clip is deterministic, tiny (38 KB) and free of personal data.
3. **The real blocker is named:** B1 (detector weights + runtime) and B2 (tracking). Until they exist, every vision
   claim in this project should be read as *plumbing verified, inference absent*.

## What this report deliberately does not claim

- It does not claim YOLO, ByteTrack, RF-DETR, OCR or homography were run. None were.
- It does not claim a `VisionObservation` was produced by the clip. The stub produces none by design.
- It does not claim the service was started on this host: `fastapi`, `uvicorn` and `cv2` are not installed here, and
  the service is intended to run from `services/vision/docker-compose.yml` (image `ultraos-vision:dev`), which was
  not built in this session.

## Reproduce

```bash
python3 services/vision/scripts/generate_synthetic_video.py --out /tmp/synthetic-court.mp4
python3 services/vision/scripts/verify_synthetic_video.py /tmp/synthetic-court.mp4
```

Exit code 0 means the asset is as described. It says nothing about detection, and this report says so on purpose.
