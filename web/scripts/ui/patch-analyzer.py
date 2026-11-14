"""Minimal, faithful patch: delegate detection to `app.analyzer` and leave persistence byte-for-byte alone.

The first attempt rewrote `write()` and silently dropped `status`, `createdAt`, the rounding, `conn.commit()` and the SECURITY
DEFINER lookup in `_organization_for`. That is exactly the kind of regression this refactor must not introduce, so the file is
patched in place instead: the only changes are (a) an import of the pure analyzer and (b) `_load`/`detect` delegating to it.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CORE = ROOT / "services/vision/app/core/analyzer.py"
source = CORE.read_text(encoding="utf-8")

if "from app.analyzer import Analyzer as DetectionAnalyzer" in source:
    print("already patched")
    raise SystemExit(0)

source = source.replace(
    "from app.core.config import get_settings\nfrom app.core.db import connection",
    "from app.analyzer import Analyzer as DetectionAnalyzer\nfrom app.core.config import get_settings\nfrom app.core.db import connection",
    1,
)

# Replace _load + detect with delegation, keeping analyze()/write()/the RLS lookup untouched.
start = source.index("    def _load(self):")
end = source.index("    def analyze(self, game_video_id: str, analysis_run_id: str) -> AnalysisResult:", start)
delegation = '''    def detect(self, path: str) -> tuple[list[Detection], dict]:
        """Detection lives in `app.analyzer` (no database imports). This wrapper keeps the dataclass the persistence code expects."""
        pure = DetectionAnalyzer(
            video_path=path,
            confidence=self.confidence,
            max_observations=self.max_observations,
        )
        detections, meta = pure.detect()
        converted = [
            Detection(
                frame_index=item.frame_index,
                video_time_ms=item.video_time_ms,
                track_id=item.track_id,
                confidence=item.confidence,
                box=item.box,
            )
            for item in detections
        ]
        return converted, meta

'''
source = source[:start] + delegation + source[end:]

CORE.write_text(source, encoding="utf-8", newline="\n")
print("core/analyzer.py patched: detection delegated, persistence untouched")
