"""VisionAnalysisRun lifecycle (B0).

Transitions: QUEUED -> PROCESSING -> COMPLETED | FAILED. Every write here targets
VisionAnalysisRun only — the service never touches canonical scoring tables.

A VisionModel row is required by the FK; B0 upserts a stub model keyed by the analyzer name so the
run lifecycle is exercised end-to-end. Real model rows are seeded/versioned in B1/B2.
"""

import logging

from app.core.db import connection
from app.core.enums import VisionAnalysisRunStatus

logger = logging.getLogger(__name__)

# The FK requires a VisionModel row. B0 uses one stable stub model per analyzer key.
STUB_MODEL_KEY = "stub-analyzer"
STUB_MODEL_VERSION = "b0"


def ensure_stub_model(organization_id: str, model_key: str, version: str) -> str:
    """Upsert and return a VisionModel id for the given organization/key."""
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "VisionModel" (id, "organizationId", key, version)
                VALUES (gen_random_uuid()::text, %s, %s, %s)
                ON CONFLICT (key) DO UPDATE SET version = EXCLUDED.version
                RETURNING id
                """,
                (organization_id, model_key, version),
            )
            model_id = cur.fetchone()[0]
        conn.commit()
    return model_id


def create_run(game_video_id: str, organization_id: str, requested_by_id: str, model_id: str) -> str:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "VisionAnalysisRun"
                    (id, "organizationId", "gameVideoId", "visionModelId", status, "requestedById")
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (organization_id, game_video_id, model_id, VisionAnalysisRunStatus.QUEUED, requested_by_id),
            )
            run_id = cur.fetchone()[0]
        conn.commit()
    logger.info("vision run queued", extra={"run_id": run_id, "game_video_id": game_video_id})
    return run_id


def mark_processing(run_id: str) -> None:
    _update(run_id, "status = %s, \"startedAt\" = now()", (VisionAnalysisRunStatus.PROCESSING,))


def mark_completed(run_id: str, observation_count: int) -> None:
    _update(
        run_id,
        "status = %s, \"completedAt\" = now(), \"observationCount\" = %s",
        (VisionAnalysisRunStatus.COMPLETED, observation_count),
    )


def mark_failed(run_id: str, error_message: str) -> None:
    _update(
        run_id,
        "status = %s, \"completedAt\" = now(), \"errorMessage\" = %s",
        (VisionAnalysisRunStatus.FAILED, error_message[:2000]),
    )


def _update(run_id: str, set_clause: str, params: tuple) -> None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f'UPDATE "VisionAnalysisRun" SET {set_clause}, "updatedAt" = now() WHERE id = %s',
                (*params, run_id),
            )
        conn.commit()


def run_status(run_id: str) -> str | None:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT status FROM "VisionAnalysisRun" WHERE id = %s', (run_id,))
            row = cur.fetchone()
            return row[0] if row else None
