"""Fal.ai client for GPU inference (v37 Prompt 2).

Why this exists: the VPS CPU measured 0.016 fps, which is ~600x too slow to process a game. Inference moves to someone else's GPU and
the VPS becomes a dispatcher.

Design choices worth stating:

  * **REST, not the SDK.** One POST and one GET; pulling a Python SDK into the worker image for that is more surface than value, and the
    queue contract here is queue-agnostic.
  * **Presigned URLs only.** The video must never become public. A 2-hour presigned R2 URL is handed to Fal, not the bucket path.
  * **Failures are states.** `submit` raises with the HTTP body; the caller marks the run FAILED with that text. A job that never
    reports is failed by deadline, not by waiting forever -- the CPU worker taught that lesson the hard way.
  * **No key, no silent fallback.** If FAL_KEY is unset the client refuses to construct. Quietly falling back to local CPU would produce
    exactly the "it is running but nothing happens" experience this streak exists to remove.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

FAL_QUEUE_BASE = os.environ.get("FAL_QUEUE_BASE", "https://queue.fal.run")
DEFAULT_MODEL = os.environ.get("FAL_VISION_MODEL", "fal-ai/yolov8")


class FalError(RuntimeError):
    """A Fal call failed. The message is written onto the run so an operator sees why."""


@dataclass
class FalJob:
    job_id: str
    status: str
    request_id: str | None = None


class FalVisionClient:
    def __init__(self, api_key: str | None = None, model: str | None = None, timeout: float = 30.0) -> None:
        key = api_key or os.environ.get("FAL_KEY")
        if not key:
            raise FalError("FAL_KEY is not configured; refusing to dispatch (no silent CPU fallback)")
        self._key = key
        self._model = model or DEFAULT_MODEL
        self._timeout = timeout

    @property
    def model(self) -> str:
        return self._model

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Key {self._key}", "Content-Type": "application/json"}

    def submit(self, *, video_url: str, frame_stride: int = 5, max_frames: int | None = None) -> FalJob:
        """Queue one inference job and return its id. `video_url` must be a presigned GET."""
        payload: dict[str, Any] = {
            "video_url": video_url,
            "frame_stride": frame_stride,
        }
        if max_frames:
            payload["max_frames"] = max_frames

        url = f"{FAL_QUEUE_BASE}/{self._model}"
        logger.info("fal submit: model=%s stride=%s", self._model, frame_stride)
        try:
            response = httpx.post(url, json=payload, headers=self._headers(), timeout=self._timeout)
        except httpx.HTTPError as error:
            raise FalError(f"fal submit failed: {error}") from error
        if response.status_code >= 400:
            raise FalError(f"fal submit rejected ({response.status_code}): {response.text[:300]}")
        body = response.json()
        job_id = body.get("request_id") or body.get("job_id")
        if not job_id:
            raise FalError(f"fal submit returned no job id: {body}")
        return FalJob(job_id=str(job_id), status=str(body.get("status", "IN_QUEUE")), request_id=body.get("request_id"))

    def status(self, job_id: str) -> FalJob:
        url = f"{FAL_QUEUE_BASE}/{self._model}/requests/{job_id}/status"
        try:
            response = httpx.get(url, headers=self._headers(), timeout=self._timeout)
        except httpx.HTTPError as error:
            raise FalError(f"fal status failed: {error}") from error
        if response.status_code >= 400:
            raise FalError(f"fal status rejected ({response.status_code}): {response.text[:300]}")
        body = response.json()
        return FalJob(job_id=job_id, status=str(body.get("status", "UNKNOWN")), request_id=body.get("request_id"))

    def result(self, job_id: str) -> dict[str, Any]:
        """The completed payload. Raises if the job is not done -- callers poll `status` first."""
        url = f"{FAL_QUEUE_BASE}/{self._model}/requests/{job_id}"
        try:
            response = httpx.get(url, headers=self._headers(), timeout=self._timeout)
        except httpx.HTTPError as error:
            raise FalError(f"fal result failed: {error}") from error
        if response.status_code >= 400:
            raise FalError(f"fal result rejected ({response.status_code}): {response.text[:300]}")
        return response.json()


def observations_from_fal(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Map Fal's output onto the rows `/api/vision/sync` already accepts.

    The contract is deliberately the same shape the desktop sidecar returns: `id`, `videoTimeMs`, `observationType`, `boundingBox`,
    `confidence`. Keeping one shape means the review UI and the persistence code do not care which compute path produced a row.
    """
    raw = payload.get("observations") or payload.get("detections") or []
    rows: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        box = item.get("bbox") or item.get("box") or item.get("boundingBox") or {}
        if isinstance(box, (list, tuple)) and len(box) == 4:
            x1, y1, x2, y2 = box
            box = {"x": x1, "y": y1, "width": abs(x2 - x1), "height": abs(y2 - y1)}
        rows.append(
            {
                "id": str(item.get("id") or f"fal-{index}"),
                "videoTimeMs": int(item.get("videoTimeMs") or item.get("timestamp_ms") or 0),
                "observationType": item.get("observationType") or "PERSON_DETECTED",
                "boundingBox": box,
                "confidence": float(item.get("confidence") or item.get("score") or 0.0),
                "trackId": None if item.get("trackId") is None else str(item.get("trackId")),
            }
        )
    return rows
