"""Celery tasks (B0).

poll_ready_videos: finds analysis-ready GameVideo rows and enqueues one analyze_video per video.
analyze_video: drives a single VisionAnalysisRun through QUEUED -> PROCESSING -> COMPLETED|FAILED
using the configured analyzer. In B0 the analyzer is the stub; B1/B2 swap in real inference.
"""

import logging

from app.core.analyzer import get_analyzer
from app.core.config import get_settings
from app.core.db import game_videos_ready_for_analysis
from app.core.run_lifecycle import (
    STUB_MODEL_KEY,
    STUB_MODEL_VERSION,
    create_run,
    ensure_stub_model,
    mark_completed,
    mark_failed,
    mark_processing,
)
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.tasks.poll_ready_videos")
def poll_ready_videos(limit: int = 20) -> int:
    videos = game_videos_ready_for_analysis(limit=limit)
    for video in videos:
        analyze_video.delay(
            game_video_id=video["id"],
            organization_id=video["organizationId"],
            requested_by_id=video.get("requestedById") or _fallback_requester(video["organizationId"]),
        )
    logger.info("poll enqueued %s video(s)", len(videos))
    return len(videos)


@celery_app.task(name="app.workers.tasks.analyze_video", bind=True)
def analyze_video(self, game_video_id: str, organization_id: str, requested_by_id: str) -> str:
    settings = get_settings()
    analyzer = get_analyzer(settings.vision_analyzer)
    model_id = ensure_stub_model(organization_id, STUB_MODEL_KEY, STUB_MODEL_VERSION)
    run_id = create_run(game_video_id, organization_id, requested_by_id, model_id)
    mark_processing(run_id)
    try:
        result = analyzer.analyze(game_video_id, run_id)
    except Exception as exc:  # noqa: BLE001 - any analyzer failure must land on the run row
        logger.exception("analyze failed", extra={"run_id": run_id})
        mark_failed(run_id, str(exc))
        raise
    mark_completed(run_id, result.observation_count)
    logger.info("analyze completed", extra={"run_id": run_id, "note": result.note})
    return run_id


def _fallback_requester(organization_id: str) -> str:
    """B0: VisionAnalysisRun.requestedById is NOT NULL with a User FK. Until the API supplies the
    real requesting user, pick an admin of the org. B1 replaces this with the authenticated caller
    passed through from the Next.js app."""
    from app.core.db import connection

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM "User"
                WHERE "organizationId" = %s
                ORDER BY "createdAt" ASC
                LIMIT 1
                """,
                (organization_id,),
            )
            row = cur.fetchone()
    if not row:
        raise RuntimeError(f"NO_REQUESTER_FOUND_FOR_ORG:{organization_id}")
    return row[0]
