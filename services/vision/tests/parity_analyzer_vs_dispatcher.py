"""Parity harness: do the extracted analyzer and the dispatcher see the same things?

UNVERIFIED. This file has never been run: it needs torch, ultralytics, opencv, the pinned weights and a database with the fixture
rows, none of which exist on the machine it was written on. It is here so the comparison is a command rather than an intention the
moment the environment can support it.

Usage:
    python -m tests.parity_analyzer_vs_dispatcher C:/clips/synthetic.mp4 <gameVideoId> <analysisRunId>

Exit code 0 on parity, 1 on divergence (with the diff printed).
"""

from __future__ import annotations

import sys
from typing import Any

TOLERANCE = 1e-6


def _key(observation: dict[str, Any]) -> tuple:
    box = observation.get("boundingBox") or {}
    return (
        observation.get("videoTimeMs"),
        observation.get("trackId"),
        observation.get("observationType"),
        round(float(box.get("x", 0.0)), 5),
        round(float(box.get("y", 0.0)), 5),
        round(float(observation.get("confidence", 0.0)), 4),
    )


def compare(pure: list[dict], persisted: list[dict]) -> list[str]:
    """Order-insensitive comparison on the fields both paths are supposed to agree on."""
    pure_keys = sorted(_key(item) for item in pure)
    persisted_keys = sorted(_key(item) for item in persisted)
    problems: list[str] = []
    if len(pure_keys) != len(persisted_keys):
        problems.append(f"count differs: sidecar {len(pure_keys)} vs dispatcher {len(persisted_keys)}")
    for left, right in zip(pure_keys, persisted_keys):
        if left != right:
            problems.append(f"mismatch: sidecar {left} vs dispatcher {right}")
    return problems


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print("usage: python -m tests.parity_analyzer_vs_dispatcher <video> <gameVideoId> <analysisRunId>")
        return 2

    video_path, game_video_id, analysis_run_id = argv[1], argv[2], argv[3]

    # Sidecar path: pure detection, no database.
    from app.analyzer import Analyzer

    pure_observations = Analyzer(video_path=video_path).run()

    # Dispatcher path: the wrapper resolves the path from the database, runs the same detection, then persists.
    from app.core.analyzer import YOLOAnalyzer

    result = YOLOAnalyzer().analyze(game_video_id, analysis_run_id)

    persisted = [
        {
            "videoTimeMs": detection.video_time_ms,
            "trackId": None if detection.track_id is None else str(detection.track_id),
            "observationType": "PERSON_DETECTED",
            "boundingBox": {
                "x": round(detection.box[0], 5),
                "y": round(detection.box[1], 5),
                "width": round(detection.box[2], 5),
                "height": round(detection.box[3], 5),
            },
            "confidence": round(detection.confidence, 4),
        }
        for detection in result.detections
    ]

    problems = compare(pure_observations, persisted)
    if problems:
        print(f"PARITY FAIL - {len(problems)} difference(s)")
        for problem in problems[:20]:
            print(f"  {problem}")
        return 1

    print(f"PARITY OK - {len(pure_observations)} observation(s) identical from both paths")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
