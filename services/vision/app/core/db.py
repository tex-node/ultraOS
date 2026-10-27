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
def connection(organization_id: str | None = None) -> Iterator[psycopg.Connection]:
    """A connection with the tenant context set when the caller knows it.

    Every Vision* table is RLS-FORCED, so a connection without `app.current_org_id` sees only the platform default
    organization. The worker learns the owning organization from app_vision_ready_videos()/app_vision_video_source()
    (SECURITY DEFINER) and then opens its write connection scoped to it - the same pattern the web app uses
    (withOrganizationContext). Passing None is for the two bootstrap calls that cannot know it yet.
    """
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    conn = psycopg.connect(settings.database_url, autocommit=False)
    try:
        if organization_id:
            with conn.cursor() as cur:
                # is_local=false: the setting lives for the connection, which is short-lived by design.
                cur.execute("SELECT set_config('app.current_org_id', %s, false)", (organization_id,))
            conn.commit()
        yield conn
    finally:
        conn.close()



def game_videos_ready_for_analysis(limit: int = 20) -> list[dict]:
    """GameVideo rows the worker can analyze.

    The app enum has no UPLOADED state; READY_FOR_ANALYSIS is the analysis-ready ingest status
    (VISION_WORKER_ARCHITECTURE.md). Only eligible videos without a non-terminal run are returned,
    so repeated polls do not stack duplicate runs.
    """
    # SECURITY DEFINER, because this runs before any tenant context exists (migration 20261028180000). A bare query
    # here saw only the platform default organization, which is how the worker silently skipped every other league.
    sql = """
        SELECT id, organization_id AS "organizationId", game_id AS "gameId", fixture_id AS "fixtureId"
        FROM app_vision_ready_videos(%s)
    """
    with connection() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, (limit,))
            return list(cur.fetchall())
