from fastapi import APIRouter, HTTPException

from app.api.schemas import AnalyzeRequest, AnalyzeResponse
from app.core.config import get_settings
from app.core.analyzer import get_analyzer
from app.core.run_lifecycle import (
    STUB_MODEL_KEY,
    STUB_MODEL_VERSION,
    create_run,
    ensure_stub_model,
)
from app.workers.tasks import analyze_video

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Queue a vision analysis run for a registered game video.

    B0 creates the run row (QUEUED) and dispatches the worker task. If the worker/broker is
    unavailable the run row still exists and the beat poller picks it up — the row is the source of
    truth, not the in-memory dispatch.
    """
    settings = get_settings()
    # Fail fast if the analyzer name is misconfigured rather than after a queue hop.
    try:
        get_analyzer(settings.vision_analyzer)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not request.requested_by_id:
        raise HTTPException(status_code=422, detail="requested_by_id is required")

    model_id = ensure_stub_model(request.organization_id, STUB_MODEL_KEY, STUB_MODEL_VERSION)
    run_id = create_run(
        game_video_id=request.game_video_id,
        organization_id=request.organization_id,
        requested_by_id=request.requested_by_id,
        model_id=model_id,
    )
    try:
        analyze_video.delay(
            game_video_id=request.game_video_id,
            organization_id=request.organization_id,
            requested_by_id=request.requested_by_id,
        )
    except Exception:  # noqa: BLE001 - broker may be down; the run row + beat poller recover it
        pass
    return AnalyzeResponse(run_id=run_id, status="QUEUED")
