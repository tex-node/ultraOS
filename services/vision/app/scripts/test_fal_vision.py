"""Submit a local video to Fal and print what comes back (v37 Prompt 2, test script).

This is deliberately a script and not a route: the point is to prove the backend before any UI depends on it. It uploads to R2 (through
the same storage abstraction the service uses), presigns a 2-hour URL, submits, polls, and prints the observation count plus the first
few rows.

Usage (inside the vision worker container, where the deps and the DB URL already are):
    python -m app.scripts.test_fal_vision /path/to/clip.mp4 [--stride 5] [--max-frames 300]

Requires FAL_KEY. Without it the client refuses to construct -- there is no CPU fallback to hide behind.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

from app.core.fal_client import FalVisionClient, observations_from_fal


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Submit a video to Fal.ai and print the observations")
    parser.add_argument("video", nargs="?", default="", help="ignored placeholder; use --media-asset or --url")
    parser.add_argument("--stride", type=int, default=int(os.environ.get("VISION_FRAME_STRIDE", "5")))
    parser.add_argument("--max-frames", type=int, default=int(os.environ.get("VISION_MAX_FRAMES", "0")))
    parser.add_argument("--url", help="a presigned video URL Fal can fetch")
    parser.add_argument("--media-asset", help="an already-uploaded MediaAsset id; presigned here for 2h")
    parser.add_argument("--poll-seconds", type=int, default=30)
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    args = parser.parse_args(argv)

    if args.media_asset:
        from app.core.storage import get_video_storage

        video_url = get_video_storage().presigned_url(args.media_asset, ttl_seconds=7200)
        print(f"  presigned 2h for asset {args.media_asset}")
    elif args.url:
        video_url = args.url
        print("  using supplied URL")
    else:
        print(
            "  pass --media-asset <id> (already uploaded) or --url <presigned GET>; this script does not upload",
            file=sys.stderr,
        )
        return 2

    client = FalVisionClient()
    print(f"  model: {client.model} · stride {args.stride} · max_frames {args.max_frames or 'none'}")

    started = time.time()
    job = client.submit(video_url=video_url, frame_stride=args.stride, max_frames=args.max_frames or None)
    print(f"  submitted: job {job.job_id} ({job.status})")

    while True:
        if time.time() - started > args.timeout_seconds:
            print(f"  timed out after {args.timeout_seconds}s with job {job.job_id}", file=sys.stderr)
            return 1
        status = client.status(job.job_id)
        print(f"  t+{int(time.time() - started)}s · {status.status}")
        if status.status in {"COMPLETED", "OK", "SUCCESS"}:
            break
        if status.status in {"FAILED", "ERROR"}:
            print("  fal reported failure", file=sys.stderr)
            return 1
        time.sleep(args.poll_seconds)

    payload = client.result(job.job_id)
    rows = observations_from_fal(payload)
    elapsed = time.time() - started
    print("")
    print(f"  COMPLETED in {elapsed:.1f}s · {len(rows)} observation(s)")
    for row in rows[:5]:
        print(f"    {row['videoTimeMs']}ms · {row['observationType']} · conf {row['confidence']:.2f}")
    if len(rows) > 5:
        print(f"    … {len(rows) - 5} more")
    print(f"  raw keys: {sorted(payload.keys())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
