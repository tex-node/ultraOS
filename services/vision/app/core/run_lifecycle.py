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


def ensure_model(organization_id: str, model_key: str, version: str) -> str:
    """Upsert and return a VisionModel id for the given organization/key.

    Named `ensure_model`, not `ensure_stub_model`: the run row must record the analyzer that actually ran. The
    original name made every run - including real YOLO inference - look like the stub, which is exactly how a
    genuine 300-observation run gets read as "the stub was used" three reports later.
    """
    # The registry KEY is global while its rows are tenant-scoped, so an upsert issued from organization B tries to
    # UPDATE a VisionModel row that organization A owns, and the policy refuses it with "new row violates row-level
    # security policy (USING expression)". That refusal is correct - the upsert is the wrong shape for a shared registry.
    # app_vision_ensure_model() does the idempotent write with definer rights (migration 20261028180000).
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT app_vision_ensure_model(%s, %s, %s)", (organization_id, model_key, version))
            model_id = cur.fetchone()[0]
        conn.commit()
    return model_id


def create_run(game_video_id: str, organization_id: str, requested_by_id: str, model_id: str) -> str:
    with connection(organization_id) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "VisionAnalysisRun"
                    (id, "organizationId", "gameVideoId", "visionModelId", status, "requestedById",
                     "createdAt", "updatedAt")
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, now(), now())
                RETURNING id
                """,
                (organization_id, game_video_id, model_id, VisionAnalysisRunStatus.QUEUED, requested_by_id),
            )
            run_id = cur.fetchone()[0]
        conn.commit()
    logger.info("vision run queued", extra={"run_id": run_id, "game_video_id": game_video_id})
    return run_id


def mark_processing(organization_id: str, run_id: str) -> None:
    _update(organization_id, run_id, "status = %s, \"startedAt\" = now()", (VisionAnalysisRunStatus.PROCESSING,))


def mark_completed(organization_id: str, run_id: str, observation_count: int) -> None:
    _update(
        organization_id,
        run_id,
        "status = %s, \"completedAt\" = now(), \"observationCount\" = %s",
        (VisionAnalysisRunStatus.COMPLETED, observation_count),
    )


def mark_failed(organization_id: str, run_id: str, error_message: str) -> None:
    _update(
        organization_id,
        run_id,
        "status = %s, \"completedAt\" = now(), \"errorMessage\" = %s",
        (VisionAnalysisRunStatus.FAILED, error_message[:2000]),
    )


def _update(organization_id: str, run_id: str, set_clause: str, params: tuple) -> None:
    with connection(organization_id) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f'UPDATE "VisionAnalysisRun" SET {set_clause}, "updatedAt" = now() WHERE id = %s',
                (*params, run_id),
            )
        conn.commit()


def run_status(organization_id: str, run_id: str) -> str | None:
    with connection(organization_id) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT status FROM "VisionAnalysisRun" WHERE id = %s', (run_id,))
            row = cur.fetchone()
            return row[0] if row else None
