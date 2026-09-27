"""B0 tests: the stub analyzer contract and enum parity with the Prisma schema.

These run without a database, a broker, or a model — they assert the service's shape, not
inference. The full lifecycle test (upload -> QUEUED..COMPLETED) arrives in B1, where it can run
against a real Postgres.
"""

from pathlib import Path

from fastapi.testclient import TestClient

from app.core.analyzer import StubAnalyzer, get_analyzer
from app.core.enums import VisionAnalysisRunStatus, VideoIngestStatus, VisionObservationStatus
from app.main import app

SCHEMA = Path(__file__).resolve().parents[3] / "web" / "prisma" / "schema.prisma"


def test_health_endpoint_reports_analyzer_and_config_state():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["analyzer"] == "stub"
    assert "database_configured" in body and "storage_configured" in body


def test_analyze_rejects_missing_requester():
    client = TestClient(app)
    res = client.post("/analyze", json={"game_video_id": "gv1", "organization_id": "org1"})
    assert res.status_code == 422



def test_stub_analyzer_reports_zero_observations_and_does_not_fabricate():
    result = StubAnalyzer().analyze(game_video_id="gv1", analysis_run_id="run1")
    assert result.observation_count == 0
    assert "STUB_ANALYZER" in result.note


def test_get_analyzer_returns_stub_for_stub_and_rejects_unknown():
    assert get_analyzer("stub").key == "stub"
    try:
        get_analyzer("does-not-exist")
    except ValueError as exc:
        assert "does-not-exist" in str(exc)
    else:
        raise AssertionError("expected ValueError for unknown analyzer")


def test_enum_values_match_prisma_schema():
    text = SCHEMA.read_text(encoding="utf-8")

    def enum_block(name: str) -> str:
        start = text.index(f"enum {name} {{")
        end = text.index("}", start)
        return text[start:end]

    run_block = enum_block("VisionAnalysisRunStatus")
    for value in (
        VisionAnalysisRunStatus.QUEUED,
        VisionAnalysisRunStatus.PROCESSING,
        VisionAnalysisRunStatus.COMPLETED,
        VisionAnalysisRunStatus.FAILED,
        VisionAnalysisRunStatus.CANCELLED,
    ):
        assert value in run_block, f"{value} missing from VisionAnalysisRunStatus"

    ingest_block = enum_block("VideoIngestStatus")
    for value in (
        VideoIngestStatus.REGISTERED,
        VideoIngestStatus.READY_FOR_ANALYSIS,
        VideoIngestStatus.PROXY_FAILED,
    ):
        assert value in ingest_block, f"{value} missing from VideoIngestStatus"

    obs_block = enum_block("VisionObservationStatus")
    for value in (
        VisionObservationStatus.PENDING,
        VisionObservationStatus.CONFIRMED,
        VisionObservationStatus.REJECTED,
        VisionObservationStatus.AMBIGUOUS,
    ):
        assert value in obs_block, f"{value} missing from VisionObservationStatus"
