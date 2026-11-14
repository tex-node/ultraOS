"""The sidecar entrypoint: a stateless inference worker on 127.0.0.1:8011.

This is what the desktop bundle runs. It knows nothing about Postgres, Celery or R2 - it takes a local file path, runs the analyzer
from `app.analyzer`, and returns observations. The desktop agent supervises it and owns the sync.
"""

from __future__ import annotations

import os
import subprocess
import time
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.analyzer import DEFAULT_MODEL_KEY, Analyzer

STARTED_AT = time.time()

app = FastAPI(title="UltraOS vision sidecar", version="0.1.0")


def _version() -> str:
    """The git sha the bundle was built from, when it is available. Never fail /health because git is absent."""
    explicit = os.environ.get("ULTRAOS_BUILD_SHA")
    if explicit:
        return explicit
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True, timeout=2).strip()
    except Exception:
        return "unknown"


class HealthResponse(BaseModel):
    status: str
    model: str
    version: str
    uptime_seconds: int
    weights_loaded: bool


class AnalyzeRequest(BaseModel):
    videoPath: str = Field(..., min_length=1)
    gameVideoId: str = Field(..., min_length=1)
    analysisRunId: str = Field(..., min_length=1)
    calibration: dict[str, Any] | None = None


class AnalyzeResponse(BaseModel):
    observations: list[dict[str, Any]]
    error: str | None = None


class CancelRequest(BaseModel):
    jobId: str = Field(..., min_length=1)


class CancelResponse(BaseModel):
    cancelled: bool


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model=DEFAULT_MODEL_KEY,
        version=_version(),
        uptime_seconds=int(time.time() - STARTED_AT),
        # Honest rather than optimistic: the weights are loaded lazily by the analyzer, so before the first /analyze this is false.
        weights_loaded=os.path.exists(os.environ.get("VISION_WEIGHTS_PATH", "yolov8n.pt")),
    )


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        observations = Analyzer(
            video_path=request.videoPath,
            calibration=request.calibration,
        ).run()
        return AnalyzeResponse(observations=observations, error=None)
    except Exception as error:  # noqa: BLE001 - the contract reports failures in-band, not as a 500
        return AnalyzeResponse(observations=[], error=f"{type(error).__name__}: {error}")


@app.post("/cancel", response_model=CancelResponse)
def cancel(_request: CancelRequest) -> CancelResponse:
    # Inference is synchronous and single-request; there is nothing in flight to interrupt. Reporting `false` is the truthful
    # answer, and the agent treats it as "not cancelled" rather than assuming success.
    return CancelResponse(cancelled=False)

def main() -> None:
    """Bind loopback only. The agent is the sole client, and a sidecar listening on 0.0.0.0 would be an inference service for the
    whole venue network."""
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8011, log_level="info")


if __name__ == "__main__":
    main()
