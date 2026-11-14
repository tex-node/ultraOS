"""Pure detection. No database, no FastAPI, no Celery - this package is what the desktop sidecar bundles.

The rule is enforced by `tests/test_analyzer_isolation.py`, which walks this package with `ast` and fails on any import of
`app.core.db` or `prisma`. That is deliberate: the desktop binary must never contain a Postgres connection string, and a rule that
lives only in a comment is a rule that gets broken.

`Analyzer` takes a path and returns plain dicts shaped like the server's `VisionObservationInput`, so the same code can be called by
the VPS dispatcher (which then persists them) and by the sidecar (which returns them over HTTP).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# The model file the bundle ships. Configurable because the sidecar carries its own copy and the VPS keeps one in its image: a
# hardcoded name would work in exactly one of those two places.
DEFAULT_MODEL_FILENAME = "yolov8n.pt"
DEFAULT_MODEL_KEY = "yolov8n-person"


def model_path(explicit: str | None = None) -> str:
    """Where the weights live: explicit arg, then VISION_WEIGHTS_PATH, then the plain filename (ultralytics' own lookup)."""
    if explicit:
        return explicit
    return os.environ.get("VISION_WEIGHTS_PATH", DEFAULT_MODEL_FILENAME)


@dataclass
class Detection:
    """One detection in one frame, normalized image space: x, y are the top-left corner."""

    frame_index: int
    video_time_ms: int
    track_id: int | None
    confidence: float
    box: tuple[float, float, float, float]  # x, y, w, h


def to_observation(detection: Detection) -> dict:
    """The wire shape `/api/vision/sync` accepts. `id` is derived from the frame and track so a retried run produces the same ids
    and the server's ON CONFLICT DO NOTHING actually does something."""
    return {
        "id": f"yolo-{detection.frame_index}-{detection.track_id if detection.track_id is not None else 'none'}",
        "videoTimeMs": detection.video_time_ms,
        "videoTimeEndMs": None,
        "observationType": "PERSON_DETECTED",
        "boundingBox": {
            "x": detection.box[0],
            "y": detection.box[1],
            "width": detection.box[2],
            "height": detection.box[3],
        },
        "courtX": None,
        "courtY": None,
        "teamCandidateSeasonClubId": None,
        "playerCandidatePlayerId": None,
        "confidence": detection.confidence,
        "trackId": None if detection.track_id is None else str(detection.track_id),
    }


class Analyzer:
    """YOLOv8 person detection over a local file.

    Only class 0 (COCO "person") is requested: a half-court clip with a ball should not produce a "sports ball" row pretending to
    be a player. The backend is imported lazily so this module can be imported (and its contract tested) on a machine without
    torch.
    """

    key = DEFAULT_MODEL_KEY

    def __init__(
        self,
        video_path: str,
        calibration: dict | None = None,
        weights_path: str | None = None,
        confidence: float | None = None,
        max_observations: int = 5000,
    ) -> None:
        self.video_path = video_path
        self.calibration = calibration
        self.weights_path = model_path(weights_path)
        self.confidence = float(os.environ.get("VISION_CONFIDENCE", "0.25")) if confidence is None else confidence
        self.max_observations = max_observations
        self._model = None

    def _load(self):
        from ultralytics import YOLO

        if self._model is None:
            self._model = YOLO(self.weights_path)
        return self._model

    def detect(self) -> tuple[list[Detection], dict]:
        import cv2

        model = self._load()
        capture = cv2.VideoCapture(self.video_path)
        if not capture.isOpened():
            raise ValueError(f"cannot open video: {self.video_path}")
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
                # persist=True carries tracker state between frames, which is what turns per-frame boxes into stable track ids.
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

    def run(self) -> list[dict]:
        """Detect and return observations. Persistence is somebody else's job - that is the whole point of this package."""
        detections, _meta = self.detect()
        return [to_observation(detection) for detection in detections]
