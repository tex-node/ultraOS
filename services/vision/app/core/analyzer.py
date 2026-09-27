"""Analyzer interface and the B0 deterministic stub.

The real analyzers (RF-DETR/YOLOv11 detector + ByteTrack + OCR + homography) arrive in B1/B2 and
implement the same `Analyzer` interface. The stub proves the lifecycle without a model, and must
never fabricate observations that look real — it emits none, and reports why.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class AnalysisResult:
    observation_count: int
    note: str


class Analyzer(ABC):
    @abstractmethod
    def analyze(self, game_video_id: str, analysis_run_id: str) -> AnalysisResult:
        """Run analysis for a video. Writes VisionObservation/VisionTrack rows in B2."""

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


def get_analyzer(name: str) -> Analyzer:
    if name == "stub":
        return StubAnalyzer()
    raise ValueError(f"Unknown VISION_ANALYZER: {name!r}")
