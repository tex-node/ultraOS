"""The persistence wrapper still delegates detection, and still owns the DB.

Torch is absent on this machine, so this proves the *wiring* with a fake detection backend: `YOLOAnalyzer.detect` must call
`app.analyzer.Analyzer`, convert its results, and leave persistence to `write()`. The real parity run (same video, same weights,
identical observations from both paths) is `tests/parity_analyzer_vs_dispatcher.py` and is UNVERIFIED until torch exists.
"""

from __future__ import annotations

import app.core.analyzer as core


class FakeDetection:
    def __init__(self) -> None:
        self.frame_index = 3
        self.video_time_ms = 100
        self.track_id = 7
        self.confidence = 0.8
        self.box = (0.1, 0.2, 0.05, 0.06)


class FakePureAnalyzer:
    received: dict = {}

    def __init__(self, video_path, calibration=None, confidence=None, max_observations=None, **_kwargs):
        FakePureAnalyzer.received = {
            "video_path": video_path,
            "calibration": calibration,
            "confidence": confidence,
            "max_observations": max_observations,
        }

    def detect(self):
        return [FakeDetection()], {"framesRead": 4, "framesWithPerson": 1}


def test_yoloanalyzer_delegates_detection(monkeypatch):
    monkeypatch.setattr(core, "DetectionAnalyzer", FakePureAnalyzer)
    detections, meta = core.YOLOAnalyzer(confidence=0.4).detect("C:/clip.mp4")

    assert FakePureAnalyzer.received["video_path"] == "C:/clip.mp4"
    assert FakePureAnalyzer.received["confidence"] == 0.4
    assert len(detections) == 1
    detection = detections[0]
    assert isinstance(detection, core.Detection), "the persistence layer must receive its own Detection dataclass"
    assert detection.track_id == 7 and detection.box == (0.1, 0.2, 0.05, 0.06)
    assert meta["framesRead"] == 4


def test_persistence_path_is_still_in_the_wrapper():
    """The database calls must live here, not in `app.analyzer`: this is the half the sidecar does not ship."""
    import inspect

    source = inspect.getsource(core.YOLOAnalyzer.write)
    assert "VisionObservation" in source
    assert "app_vision_video_source" in inspect.getsource(core.YOLOAnalyzer._organization_for)
