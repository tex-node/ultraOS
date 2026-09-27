"""Minimal Postgres access for the vision service (B0).

Uses a short-lived psycopg connection per call rather than an ORM: the service touches a handful
of vision tables and must never write canonical scoring data. All SQL here is explicitly scoped to
Vision* tables.
"""

import logging
from contextlib import contextmanager
from typing import Iterator

import psycopg

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    conn = psycopg.connect(settings.database_url, autocommit=False)
    try:
        yield conn
    finally:
        conn.close()


def game_videos_ready_for_analysis(limit: int = 20) -> list[dict]:
    """GameVideo rows the worker can analyze.

    The app enum has no UPLOADED state; READY_FOR_ANALYSIS is the analysis-ready ingest status
    (VISION_WORKER_ARCHITECTURE.md). Only eligible videos without a non-terminal run are returned,
    so repeated polls do not stack duplicate runs.
    """
    sql = """
        SELECT gv.id, gv."organizationId", gv."gameId", gv."fixtureId"
        FROM "GameVideo" gv
        WHERE gv."ingestStatus" = 'READY_FOR_ANALYSIS'
          AND gv."analysisEligible" = true
          AND NOT EXISTS (
              SELECT 1 FROM "VisionAnalysisRun" r
              WHERE r."gameVideoId" = gv.id
                AND r.status IN ('QUEUED', 'PROCESSING')
          )
        ORDER BY gv."createdAt" ASC
        LIMIT %s
    """
    with connection() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, (limit,))
            return list(cur.fetchall())
