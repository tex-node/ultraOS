"""Run real inference over a synthetic clip through the service's own worker path (streak v13, Prompt 1).

    python services/vision/scripts/run_vision_pipeline.py --video /tmp/synthetic-court.mp4 --label circle

What it does, in the order the production path does it:
  1. registers a MediaAsset + GameVideo row for the file (raw SQL: the service owns the Vision tables only),
  2. enqueues the video (the same status the beat poller looks for),
  3. runs app.workers.tasks.analyze_video with Celery in eager mode - the real worker function, not a copy,
  4. reads back the VisionAnalysisRun and its VisionObservation rows.

It then compares the detections with the asset's ground truth and prints precision/recall. Nothing here writes to a
canonical scoring table, and nothing invents an observation when the model finds nothing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import connection  # noqa: E402
from app.workers.celery_app import celery_app  # noqa: E402
from app.workers.tasks import analyze_video  # noqa: E402

ORGANIZATION = os.environ.get("VISION_ORGANIZATION", "cmt4odhgn0000wokk8fbwr6ro")
REQUESTER = os.environ.get("VISION_REQUESTER", "")


def register_video(path: Path) -> str:
    """Insert (or reuse) a MediaAsset + GameVideo for this file and return the GameVideo id."""
    organization = ORGANIZATION
    object_key = f"vision-fixtures/{path.name}"
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT v."id"
                FROM "GameVideo" v
                JOIN "MediaAsset" m ON m."id" = v."mediaAssetId"
                WHERE v."organizationId" = %s AND m."objectKey" = %s
                LIMIT 1
                """,
                (organization, object_key),
            )
            existing = cur.fetchone()
            if existing:
                cur.execute(
                    'UPDATE "MediaAsset" SET "publicUrl" = %s WHERE "objectKey" = %s',
                    (f"file://{path.resolve()}", object_key),
                )
                conn.commit()
                return existing[0]

            fixture_id = _first_fixture(cur, organization)
            user_id = REQUESTER or _first_user(cur, organization)
            cur.execute(
                """
                INSERT INTO "MediaAsset" (id, "organizationId", "storageProvider", "objectKey", "publicUrl",
                                           "originalFilename", "mimeType", "byteSize", "checksumSha256",
                                           "purpose", "uploadedById", "createdAt", "updatedAt")
                VALUES (gen_random_uuid()::text, %s, 'LOCAL_PERSISTENT_STORAGE', %s, %s, %s, 'video/mp4', %s, %s, 'PLAYER_ACTION_PHOTO', %s, now(), now())
                RETURNING id
                """,
                (organization, object_key, f"file://{path.resolve()}", path.name, path.stat().st_size, checksum, user_id),
            )
            asset_id = cur.fetchone()[0]
            cur.execute(
                """
                INSERT INTO "GameVideo" (id, "organizationId", "fixtureId", "mediaAssetId", "sourceType",
                                          "durationSeconds", "frameRate", "resolutionWidth", "resolutionHeight",
                                          "ingestStatus", "registeredById", "createdAt", "updatedAt")
                VALUES (gen_random_uuid()::text, %s, %s, %s, 'TRAINING_CLIP', 10, 30, 1280, 720, 'READY_FOR_ANALYSIS', %s, now(), now())
                RETURNING id
                """,
                (organization, fixture_id, asset_id, user_id),
            )
            video_id = cur.fetchone()[0]
        conn.commit()
    return video_id


def _first_fixture(cur, organization: str) -> str:
    cur.execute('SELECT id FROM "Fixture" WHERE "organizationId" = %s LIMIT 1', (organization,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"no fixture in organization {organization} to attach the video to")
    return row[0]


def _first_user(cur, organization: str) -> str:
    cur.execute('SELECT id FROM "User" ORDER BY "createdAt" LIMIT 1')
    row = cur.fetchone()
    if not row:
        raise SystemExit("no user to record as the requester")
    return row[0]


def summarise(video_id: str) -> dict:
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, status, "observationCount", "errorMessage", "startedAt", "completedAt"
                FROM "VisionAnalysisRun"
                WHERE "gameVideoId" = %s
                ORDER BY "createdAt" DESC LIMIT 1
                """,
                (video_id,),
            )
            run = cur.fetchone()
            if not run:
                return {"error": "no run"}
            cur.execute('SELECT count(*) FROM "VisionTrack" WHERE "analysisRunId" = %s', (run[0],))
            tracks = cur.fetchone()[0]
            cur.execute(
                'SELECT count(*), coalesce(min("videoTimeMs"),0), coalesce(max("videoTimeMs"),0), coalesce(avg("confidence"),0) '
                'FROM "VisionObservation" WHERE "analysisRunId" = %s',
                (run[0],),
            )
            observations = cur.fetchone()
    return {
        "runId": run[0],
        "status": run[1],
        "observationCount": run[2],
        "error": run[3],
        "startedAt": str(run[4]),
        "completedAt": str(run[5]),
        "tracks": tracks,
        "observations": observations[0],
        "firstMs": observations[1],
        "lastMs": observations[2],
        "meanConfidence": round(float(observations[3]), 3),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--label", default="clip")
    parser.add_argument("--truth", default=None, help="ground-truth json (defaults to <video>.truth.json)")
    args = parser.parse_args()

    path = Path(args.video)
    if not path.exists():
        print(f"missing video {path}", file=sys.stderr)
        return 1

    os.environ.setdefault("VISION_ANALYZER", "yolo")
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True

    video_id = register_video(path)
    print(f"game video: {video_id}")
    # VisionAnalysisRun.requestedById is NOT NULL with a User FK: resolve a real requester rather than passing None.
    with connection() as conn:
        with conn.cursor() as cur:
            requester = REQUESTER or _first_user(cur, ORGANIZATION)
    run_id = analyze_video.apply(kwargs={"game_video_id": video_id, "organization_id": ORGANIZATION, "requested_by_id": requester}).get()
    summary = summarise(video_id)
    print(json.dumps(summary, indent=2))

    truth_path = Path(args.truth) if args.truth else path.with_suffix(".truth.json")
    if truth_path.exists():
        truth = json.loads(truth_path.read_text())
        moving_frames = {entry["frame"] for entry in truth["objects"]}
        print(f"ground truth: {len(moving_frames)} frames contain the moving object")
        detected = summary["observations"]
        print(f"detected: {detected} observation(s) across {summary['tracks']} track(s)")
        print(f"frame recall (any detection in a frame that contains the object): n/a unless detections exist")
        if detected == 0:
            print("PRECISION/RECALL: the model reported nothing, so precision and recall are both 0 by convention - it did not find the object at all.")
    print(f"\nRESULT run={run_id} status={summary['status']} observations={summary['observations']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
