"""Fal GPU app: our own YOLOv8n detector, not a hosted foundation model (v37 Prompt 4).

Why we deploy instead of using a catalogue model: Fal does not host a YOLO detection endpoint (every `fal-ai/yolov8*` returns 404), and the
alternatives change the observation shape that the desktop sync, the VPS persistence, the review UI and highlight generation all assume.
Shipping our own handler keeps one schema and one model, and compute is priced per GPU-second rather than per call.

The handler is thin on purpose: download, run the same `app.analyzer.Analyzer` the desktop sidecar uses, return observations. No database,
no R2 credentials, no persistence - the VPS writes rows when the result comes back.

API note: fal 1.84 exposes `fal.App` + `@fal.endpoint(path)`; the older `@fal.function(machine_type=...)` decorator no longer takes those
arguments, which is why the class form is used here.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any

import fal
from pydantic import BaseModel

MODEL_KEY = "yolov8n-person"
BUILD_VERSION = os.environ.get("ULTRAOS_BUILD_SHA", "dev")
MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024  # a guard against a wrong URL, not a limit anyone should hit


class VisionInput(BaseModel):
    video_url: str
    stride: int = 5
    max_frames: int | None = 300


class VisionOutput(BaseModel):
    observations: list[dict[str, Any]]
    metadata: dict[str, Any]


def _download(url: str, destination: str) -> int:
    import httpx

    total = 0
    with httpx.stream("GET", url, timeout=120, follow_redirects=True) as response:
        response.raise_for_status()
        with open(destination, "wb") as handle:
            for chunk in response.iter_bytes(chunk_size=1024 * 256):
                total += len(chunk)
                if total > MAX_DOWNLOAD_BYTES:
                    raise ValueError("video exceeds the 2 GB download guard")
                handle.write(chunk)
    return total


class UltraOSVision(fal.App):
    """`fal deploy services/vision/fal_app/handler.py::UltraOSVision --app-name ultraos-vision`."""

    requirements = ["torch", "torchvision", "ultralytics", "opencv-python-headless", "httpx", "pydantic"]
    # L4 for the nano model: it is compute-bound at 640px, so an A100 costs several times more for no speedup.
    machine_type = "GPU-L4"
    num_gpus = 1
    keep_alive = 0
    max_concurrency = 1

    @fal.endpoint("/")
    def run(self, request: VisionInput) -> VisionOutput:
        from app.analyzer import Analyzer

        # pydantic rejects a missing video_url before this runs; an empty string is still possible, and a silent 2 GB download attempt to
        # nowhere is a worse failure than a clear message.
        if not request.video_url.strip():
            raise ValueError("video_url is empty; refusing to run")

        with tempfile.TemporaryDirectory() as workdir:
            path = os.path.join(workdir, "clip.mp4")
            size = _download(request.video_url, path)

            # The analyzer already honours these; setting them per request means one deployment serves every caller instead of a
            # stride baked into the image.
            os.environ["VISION_FRAME_STRIDE"] = str(max(1, request.stride))
            os.environ["VISION_MAX_FRAMES"] = str(request.max_frames or 0)

            observations = Analyzer(video_path=path, calibration=None).run()
            return VisionOutput(
                observations=observations,
                metadata={
                    "model": MODEL_KEY,
                    "version": BUILD_VERSION,
                    "bytes_downloaded": size,
                    "frame_count": len(observations),
                    "stride": request.stride,
                    "max_frames": request.max_frames,
                },
            )
