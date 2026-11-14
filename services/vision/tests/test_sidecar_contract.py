"""Contract test for the sidecar entrypoint.

Inference is mocked: the point is the wire shape in `documentation/architecture/VISION_SIDECAR_CONTRACT.md`, not whether YOLO finds a
person in a file that does not exist on this machine.
"""

from __future__ import annotations

import sys
import types

import pytest
from fastapi.testclient import TestClient

from app import sidecar_main


@pytest.fixture()
def client() -> TestClient:
    return TestClient(sidecar_main.app)


def test_health_matches_the_contract(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    for field in ("model", "version", "uptime_seconds", "weights_loaded"):
        assert field in body, f"/health is missing {field}"
    assert isinstance(body["weights_loaded"], bool)


def test_analyze_returns_observations_and_no_error(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    observations = [
        {
            "id": "yolo-0-1",
            "videoTimeMs": 0,
            "videoTimeEndMs": None,
            "observationType": "PERSON_DETECTED",
            "boundingBox": {"x": 0.4, "y": 0.3, "width": 0.05, "height": 0.12},
            "courtX": None,
            "courtY": None,
            "teamCandidateSeasonClubId": None,
            "playerCandidatePlayerId": None,
            "confidence": 0.9,
            "trackId": "1",
        }
    ]

    class FakeAnalyzer:
        def __init__(self, video_path, calibration=None, **_kwargs):
            self.video_path = video_path
            self.calibration = calibration

        def run(self):
            return observations

    monkeypatch.setattr(sidecar_main, "Analyzer", FakeAnalyzer)

    response = client.post(
        "/analyze",
        json={
            "videoPath": "C:/clip.mp4",
            "gameVideoId": "video-1",
            "analysisRunId": "run-1",
            "calibration": None,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["error"] is None
    assert body["observations"] == observations


def test_analyze_reports_failure_in_band(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    class ExplodingAnalyzer:
        def __init__(self, *args, **kwargs):
            pass

        def run(self):
            raise ValueError("cannot open video: C:/missing.mp4")

    monkeypatch.setattr(sidecar_main, "Analyzer", ExplodingAnalyzer)
    response = client.post(
        "/analyze",
        json={"videoPath": "C:/missing.mp4", "gameVideoId": "v", "analysisRunId": "r", "calibration": None},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["observations"] == []
    assert "cannot open video" in body["error"]


def test_sidecar_never_imports_the_database():
    """`app.sidecar_main` must be importable with `app.core.db` made unimportable: if the sidecar touched the DB, it would fail."""
    calls: list[str] = []

    class Forbidden(types.ModuleType):
        def __getattr__(self, name):  # pragma: no cover - only reached on a regression
            calls.append(name)
            raise AssertionError("the sidecar must not touch app.core.db")

    original = {name: module for name, module in sys.modules.items() if name.startswith("app.core")}
    try:
        for name in list(original):
            sys.modules.pop(name, None)
        sys.modules["app.core.db"] = Forbidden("app.core.db")
        for module_name in [name for name in sys.modules if name.startswith("app.sidecar")]:
            sys.modules.pop(module_name, None)
        import importlib

        importlib.import_module("app.sidecar_main")
    finally:
        for name in list(sys.modules):
            if name.startswith("app.core"):
                sys.modules.pop(name, None)
        sys.modules.update(original)

    assert calls == []
