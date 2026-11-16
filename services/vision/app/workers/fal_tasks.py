"""Dispatch and polling for GPU inference (v37 Prompt 2).

The worker stops running YOLO itself. It presigns the video, submits a Fal job, records the job id on the run, and a separate polling
task finalises the run when Fal reports COMPLETED. The persistence shape is identical to the desktop path, so nothing downstream cares
which compute produced a row.

Mode switch: `VISION_INFERENCE_MODE` = `cloud` (default here) or `desktop`. There is no `cpu` mode on purpose -- the VPS measured
0.016 fps, and a silent CPU fallback is how "it is running but nothing happens" happened.
"""

from __future__ import annotations

import logging
import os

from app.core.db import connection
from app.core.fal_client import FalError, FalVisionClient, observations_from_fal
from app.core.run_lifecycle import create_run, ensure_model, mark_completed, mark_failed, mark_processing
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

POLL_TASK = "app.workers.tasks.poll_fal_job"
JOB_ID_KEY = "fal_job_id"
REQUESTED_AT_KEY = "fal_requested_at"


@celery_app.task(name="app.workers.tasks.dispatch_vision_job", bind=True)
def dispatch_vision_job(self, game_video_id: str, organization_id: str, requested_by_id: str, run_id: str | None = None) -> str:
    """Presign the video, submit it to Fal, and record the job id on the run."""
    client = FalVisionClient()  # raises if FAL_KEY is missing; that is the point
    model_id = ensure_model(organization_id, client.model, "fal")
    if run_id is None:
        run_id = create_run(game_video_id, organization_id, requested_by_id, model_id)

    video_url = presigned_video_url(game_video_id)
    mark_processing(organization_id, run_id)

    try:
        job = client.submit(
            video_url=video_url,
            frame_stride=int(os.environ.get("VISION_FRAME_STRIDE", "5")),
            max_frames=int(os.environ.get("VISION_MAX_FRAMES", "0")) or None,
        )
    except FalError as error:
        logger.error("fal dispatch failed: %s", error)
        mark_failed(organization_id, run_id, str(error))
        raise

    with connection(organization_id) as conn:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "VisionAnalysisRun" SET "configHash" = %s WHERE id = %s',
                (f"{JOB_ID_KEY}={job.job_id}", run_id),
            )
        conn.commit()

    logger.info("fal job %s queued for run %s", job.job_id, run_id)
    poll_fal_job.apply_async(args=[run_id, organization_id, job.job_id], countdown=30)
    return run_id


@celery_app.task(name=POLL_TASK, bind=True)
def poll_fal_job(self, run_id: str, organization_id: str, job_id: str, attempt: int = 1) -> str:
    """Poll Fal until the job finishes, then persist. Bounded so a lost job cannot sit in PROCESSING forever."""
    max_attempts = int(os.environ.get("VISION_POLL_MAX_ATTEMPTS", "60"))  # 60 x 30s = 30 min
    client = FalVisionClient()

    try:
        job = client.status(job_id)
    except FalError as error:
        logger.warning("fal status error (attempt %s): %s", attempt, error)
        job = None

    if job is not None and job.status in {"COMPLETED", "OK", "SUCCESS"}:
        try:
            payload = client.result(job_id)
            rows = observations_from_fal(payload)
            written = persist_observations(organization_id, run_id, rows)
        except FalError as error:
            mark_failed(organization_id, run_id, f"result fetch failed: {error}")
            raise
        mark_completed(organization_id, run_id, written)
        logger.info("fal run %s completed: %s observation(s)", run_id, written)
        return run_id

    if job is not None and job.status in {"FAILED", "ERROR"}:
        mark_failed(organization_id, run_id, "fal reported the job failed")
        return run_id

    if attempt >= max_attempts:
        mark_failed(organization_id, run_id, f"fal job {job_id} did not finish within {max_attempts} polls")
        logger.error("fal run %s timed out after %s polls", run_id, attempt)
        return run_id

    poll_fal_job.apply_async(args=[run_id, organization_id, job_id, attempt + 1], countdown=30)
    return run_id


def presigned_video_url(game_video_id: str, ttl_seconds: int = 7200) -> str:
    """A short-lived GET URL for the registered video.

    Fal must fetch the file itself, and the file must not become public. If the media lives locally (the desktop path) there is nothing
    to presign -- that is a caller error, not a reason to upload implicitly.
    """
    from app.core.storage import get_video_storage  # local import: keeps this module importable without boto3

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT ma.id, ma."objectKey" FROM "MediaAsset" ma JOIN "GameVideo" gv ON gv."mediaAssetId" = ma.id WHERE gv.id = %s',
                (game_video_id,),
            )
            row = cur.fetchone()
    if not row:
        raise FalError(f"no media asset for game video {game_video_id}")
    media_asset_id, object_key = row
    if str(object_key).startswith("local://"):
        raise FalError("video was registered as local-only; the cloud path needs an uploaded file")
    # The provider decides how a URL is produced (local disk vs R2); asking it keeps that decision in one place.
    return get_video_storage().presigned_url(media_asset_id, ttl_seconds)


def persist_observations(organization_id: str, run_id: str, rows: list[dict]) -> int:
    """Same insert shape the desktop sync uses, so RLS and the review UI behave identically."""
    if not rows:
        return 0
    written = 0
    with connection(organization_id) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT "gameVideoId" FROM "VisionAnalysisRun" WHERE id = %s', (run_id,))
            game_video_id = cur.fetchone()[0]
            for row in rows:
                cur.execute(
                    """
                    INSERT INTO "VisionObservation" (id, "organizationId", "analysisRunId", "gameVideoId",
                                                      "videoTimeMs", "observationType", "boundingBox", "confidence")
                    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        row["id"],
                        organization_id,
                        run_id,
                        game_video_id,
                        row["videoTimeMs"],
                        row["observationType"],
                        __import__("json").dumps(row["boundingBox"]),
                        row["confidence"],
                    ),
                )
                written += cur.rowcount
        conn.commit()
    return written
