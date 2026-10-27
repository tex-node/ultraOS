"""Analyzers: the B0 stub and the real YOLO detector.

The stub proves the lifecycle without a model and must never fabricate observations that look real — it emits
none, and says why. `YOLOAnalyzer` is real inference: it loads yolov8n.pt, detects COCO class 0 (person) on every
frame, keeps ByteTrack ids, and writes VisionTrack / VisionObservation rows for what it actually saw.

Nothing in this file invents a row when the model finds nothing. "Zero observations" is a legitimate answer and,
for a synthetic orange circle, it is the expected one — see documentation/vision/VISION_EMPIRICAL_REPORT.md.
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.core.db import connection


@dataclass
class Detection:
    """One detection in one frame, normalized image space: x, y are the top-left corner."""

    frame_index: int
    video_time_ms: int
    track_id: int | None
    confidence: float
    box: tuple[float, float, float, float]  # x, y, w, h


@dataclass
class AnalysisResult:
    observation_count: int
    note: str
    detections: list[Detection] = field(default_factory=list)


class Analyzer(ABC):
    @abstractmethod
    def analyze(self, game_video_id: str, analysis_run_id: str) -> AnalysisResult:
        """Run analysis for a video. Writes VisionObservation/VisionTrack rows."""

    @property
    @abstractmethod
    def key(self) -> str:
        """Stable analyzer identifier (recorded on the run as the model key)."""


class StubAnalyzer(Analyzer):
    """B0: no model, no fabricated output. Returns zero observations and a truthful note."""

    key = "stub"

    def analyze(self, game_video_id: str, analysis_run_id: str) -> AnalysisResult:
        return AnalysisResult(
            observation_count=0,
            note="STUB_ANALYZER: no inference performed; real CV lands in B1/B2.",
        )


def video_path_for(game_video_id: str) -> str:
    """Resolve what the analysis should read: MediaAsset.publicUrl, else objectKey.

    The database stores where a video lives; the analyzer must not guess. A file:// URL or an absolute
    path is used directly, anything else is treated as a local object key.
    """
    # SECURITY DEFINER (migration 20261028180000): this runs before the worker knows the owning organization, and
    # both tables are RLS-forced, so a bare join saw only the platform default organization.
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT organization_id, public_url, object_key FROM app_vision_video_source(%s)", (game_video_id,))
            row = cur.fetchone()
    if not row:
        raise ValueError(f"no GameVideo/MediaAsset for {game_video_id}")
    _organization_id, public_url, object_key = row
    candidate = public_url or object_key
    if candidate.startswith("file://"):
        return candidate[len("file://") :]
    if candidate.startswith("/"):
        # An absolute path was stored (the legacy demo rows are file:///tmp/...), so use it as given.
        return candidate
    # A relative object key is resolved against the mounted media root (streak v24). Without this the worker looked for
    # "originals/<org>/video/<sha>.mp4" relative to /app and every real ingest failed with "cannot open video".
    from app.core.config import get_settings

    return os.path.join(get_settings().vision_media_root, candidate)


class YOLOAnalyzer(Analyzer):
    """YOLOv8 person detection with ByteTrack ids, written to the vision tables.

    Only class 0 (COCO "person") is requested: a half-court clip with a ball should not produce a
    "sports ball" row pretending to be a player.
    """

    key = "yolov8n-person"

    def __init__(self, confidence: float | None = None, max_observations: int = 5000) -> None:
        self.confidence = float(os.environ.get("VISION_CONFIDENCE", "0.25")) if confidence is None else confidence
        self.max_observations = max_observations
        self._model = None

    def _load(self):
        # Lazy, so the service can still start (and the stub still work) when torch is absent.
        from ultralytics import YOLO

        if self._model is None:
            self._model = YOLO("yolov8n.pt")
        return self._model

    def detect(self, path: str) -> tuple[list[Detection], dict]:
        import cv2

        model = self._load()
        capture = cv2.VideoCapture(path)
        if not capture.isOpened():
            raise ValueError(f"cannot open video: {path}")
        fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

        detections: list[Detection] = []
        frames_with_person = 0
        index = 0
        try:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                # persist=True carries tracker state between frames, which is what turns per-frame boxes
                # into stable track ids.
                results = model.track(frame, persist=True, classes=[0], conf=self.confidence, verbose=False)
                boxes = results[0].boxes if results else None
                if boxes is not None and len(boxes) > 0:
                    frames_with_person += 1
                    xywhn = boxes.xywhn.cpu().numpy()
                    confidences = boxes.conf.cpu().numpy()
                    ids = boxes.id.cpu().numpy() if boxes.id is not None else [None] * len(xywhn)
                    for (cx, cy, w, h), score, track_id in zip(xywhn, confidences, ids):
                        if len(detections) >= self.max_observations:
                            break
                        detections.append(
                            Detection(
                                frame_index=index,
                                video_time_ms=int(index * 1000 / fps),
                                track_id=int(track_id) if track_id is not None else None,
                                confidence=float(score),
                                box=(float(cx - w / 2), float(cy - h / 2), float(w), float(h)),
                            )
                        )
                index += 1
        finally:
            capture.release()

        return detections, {
            "fps": fps,
            "width": width,
            "height": height,
            "frameCount": frame_count or index,
            "framesRead": index,
            "framesWithPerson": frames_with_person,
        }

    def analyze(self, game_video_id: str, analysis_run_id: str) -> AnalysisResult:
        path = video_path_for(game_video_id)
        detections, meta = self.detect(path)
        tracks = self.write(game_video_id, analysis_run_id, detections)
        note = (
            f"YOLOv8n person: {len(detections)} observation(s) in {meta['framesRead']} frames "
            f"({meta['framesWithPerson']} with a person), {tracks} track(s), conf>={self.confidence}"
        )
        return AnalysisResult(observation_count=len(detections), note=note, detections=detections)

    def write(self, game_video_id: str, analysis_run_id: str, detections: list[Detection]) -> int:
        """One VisionTrack per track id, one VisionObservation per detection."""
        if not detections:
            return 0
        organization_id = self._organization_for(game_video_id)
        by_track: dict[int, list[Detection]] = {}
        for detection in detections:
            if detection.track_id is not None:
                by_track.setdefault(detection.track_id, []).append(detection)

        # Scoped to the owning organization: VisionTrack/VisionObservation are RLS-forced, so an unscoped insert
        # is refused (or lands in the default organization) exactly like the reads were.
        with connection(organization_id) as conn:
            with conn.cursor() as cur:
                track_ids: dict[int, str] = {}
                for track_id, items in by_track.items():
                    cur.execute(
                        """
                        INSERT INTO "VisionTrack" (id, "organizationId", "gameVideoId", "analysisRunId",
                                                    "startVideoTimeMs", "endVideoTimeMs")
                        VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            organization_id,
                            game_video_id,
                            analysis_run_id,
                            min(item.video_time_ms for item in items),
                            max(item.video_time_ms for item in items),
                        ),
                    )
                    track_ids[track_id] = cur.fetchone()[0]

                for detection in detections:
                    x, y, w, h = detection.box
                    cur.execute(
                        """
                        INSERT INTO "VisionObservation" (id, "organizationId", "analysisRunId", "gameVideoId",
                                                          "trackId", "videoTimeMs", "observationType",
                                                          "boundingBox", "confidence", "status", "createdAt")
                        VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, 'PERSON_DETECTED', %s::jsonb, %s, 'PENDING', now())
                        """,
                        (
                            organization_id,
                            analysis_run_id,
                            game_video_id,
                            track_ids.get(detection.track_id) if detection.track_id is not None else None,
                            detection.video_time_ms,
                            json.dumps(
                                {
                                    "x": round(x, 5),
                                    "y": round(y, 5),
                                    "width": round(w, 5),
                                    "height": round(h, 5),
                                }
                            ),
                            round(detection.confidence, 4),
                        ),
                    )
            conn.commit()
        return len(track_ids)

    @staticmethod
    def _organization_for(game_video_id: str) -> str:
        # SECURITY DEFINER (migration 20261028180000): GameVideo is RLS-forced and this runs before the worker knows
        # which organization the video belongs to - the question it is trying to answer.
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT organization_id FROM app_vision_video_source(%s)", (game_video_id,))
                row = cur.fetchone()
        if not row:
            raise ValueError(f"no GameVideo {game_video_id}")
        return row[0]


def get_analyzer(name: str) -> Analyzer:
    settings = get_settings()
    if name == "stub":
        return StubAnalyzer()
    if name in ("yolo", "yolov8n-person"):
        return YOLOAnalyzer()
    if name == settings.vision_analyzer:
        return YOLOAnalyzer() if name.startswith("yolo") else StubAnalyzer()
    raise ValueError(f"Unknown VISION_ANALYZER: {name!r}")
