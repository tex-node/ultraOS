"""Dry-run the Fal polling task with a mocked client (v37 Prompt 6, Action 3).

Proves three things without a real Fal job: observations are written in the existing shape, the run reaches COMPLETED with the right count,
and replaying the same task creates no duplicate rows (which matters because Fal can retry and a webhook can arrive twice).

Runs inside the worker container so it uses the real DB connection, the real task and the real persistence code. Creates a throwaway run
and deletes it afterwards, so production rows are not polluted.
"""

from __future__ import annotations

import json
import uuid

from app.core.db import connection
from app.core.fal_client import FalJob
from app.workers import fal_tasks

GAME_VIDEO_ID = "cmwi1bb5k0001oqkkf0t0evf8"
OBSERVATIONS = [
    {
        "id": "dryrun-obs-1",
        "videoTimeMs": 1200,
        "observationType": "PERSON_DETECTED",
        "boundingBox": {"x": 100.0, "y": 50.0, "width": 30.0, "height": 80.0},
        "confidence": 0.91,
        "trackId": "t1",
    },
    {
        "id": "dryrun-obs-2",
        "videoTimeMs": 2400,
        "observationType": "PERSON_DETECTED",
        "boundingBox": {"x": 110.0, "y": 52.0, "width": 30.0, "height": 80.0},
        "confidence": 0.86,
        "trackId": "t1",
    },
]


class FakeClient:
    model = "fal-ai/tex-node/ultraos-vision"

    def __init__(self, *args, **kwargs):
        pass

    def status(self, job_id):
        return FalJob(job_id=job_id, status="COMPLETED")

    def result(self, job_id):
        return {"observations": OBSERVATIONS, "metadata": {"model": "yolov8n-person"}}


def main() -> int:
    # Point the task at the fake instead of the network.
    fal_tasks.FalVisionClient = FakeClient  # type: ignore[assignment]

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT "organizationId" FROM "GameVideo" WHERE id = %s', (GAME_VIDEO_ID,))
            org = cur.fetchone()[0]
            run_id = f"dryrun-{uuid.uuid4()}"
            cur.execute('SELECT "visionModelId" FROM "VisionAnalysisRun" WHERE "gameVideoId" = %s LIMIT 1', (GAME_VIDEO_ID,))
            row = cur.fetchone()
            model_id = row[0]
            cur.execute(
                'SELECT id FROM "User" LIMIT 1',
            )
            user_id = cur.fetchone()[0]
            cur.execute(
                """
                INSERT INTO "VisionAnalysisRun" (id, "organizationId", "gameVideoId", "visionModelId", status,
                                                 "requestedById", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, 'PROCESSING', %s, now(), now())
                """,
                (run_id, org, GAME_VIDEO_ID, model_id, user_id),
            )
        conn.commit()

    print("run:", run_id)
    print("mock observation:", json.dumps(OBSERVATIONS[0], sort_keys=True))

    # First pass: writes both observations and completes the run.
    fal_tasks.poll_fal_job(run_id=run_id, organization_id=org, job_id="fake-job", attempt=1)

    # Second pass: replay. Nothing new may be written.
    fal_tasks.poll_fal_job(run_id=run_id, organization_id=org, job_id="fake-job", attempt=1)

    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT count(*) FROM "VisionObservation" WHERE "analysisRunId" = %s', (run_id,))
            count = cur.fetchone()[0]
            cur.execute('SELECT status::text, "observationCount" FROM "VisionAnalysisRun" WHERE id = %s', (run_id,))
            status, reported = cur.fetchone()
        # Clean up: the dry run must not leave rows behind in a real table.
        with conn.cursor() as cur:
            cur.execute('DELETE FROM "VisionObservation" WHERE "analysisRunId" = %s', (run_id,))
            cur.execute('DELETE FROM "VisionAnalysisRun" WHERE id = %s', (run_id,))
        conn.commit()

    print(f"rows after two passes: {count} (expected 2 - replay must not duplicate)")
    print(f"run status: {status} · observationCount: {reported}")
    ok = count == 2 and status == "COMPLETED" and reported == 2
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
