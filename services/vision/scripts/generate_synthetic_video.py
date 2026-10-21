"""Generate a synthetic basketball half-court clip (streak v12, Prompt 3).

    python3 services/vision/scripts/generate_synthetic_video.py --out /tmp/synthetic-court.mp4

Why this exists: the vision pipeline is blocked on "no real video", and while that is true it hides a second,
harder truth - the service has no detector yet either. A synthetic clip separates the two. It is deterministic, it
needs no camera, and it makes the moment B1 lands testable: the same asset can be fed to a real detector and the
detections compared against the ground truth this script also writes.

Dependencies are deliberately minimal: numpy for the frames and ffmpeg (already on the host) for encoding. opencv is
NOT required - a generator that needs the same library as the analyser would be harder to trust, not easier.

The scene is a half-court in the Neon Ultra palette with one bright orange circle (an object detection model's
favourite colour) crossing the key from the left wing to the right wing over ten seconds, plus a static second
circle that never moves. A tracker that is working follows the moving one and leaves the static one alone; the
ground truth written next to the video says where they are in every frame.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np

WIDTH = 1280
HEIGHT = 720
FPS = 30
DURATION_SECONDS = 10
FRAME_COUNT = FPS * DURATION_SECONDS

# Neon Ultra ink and brand colours, as BGR (ffmpeg rawvideo is BGR24).
INK_900 = (20, 16, 14)
INK_700 = (44, 38, 34)
COURT_LINE = (190, 190, 190)
BRAND = (179, 242, 22)  # #16F2B3
ORANGE = (0, 140, 255)  # a saturated orange in BGR, what a detector expects of a ball
STATIC_MARKER = (60, 60, 200)


def half_court(background: np.ndarray) -> None:
    """Paint a half-court once; the clip reuses the same surface for every frame."""
    background[:] = INK_900
    # The floor area of a half court, inset.
    background[80:660, 160:1120] = INK_700
    # Baseline, sidelines and the free-throw line.
    background[80:86, 160:1120] = COURT_LINE
    background[654:660, 160:1120] = COURT_LINE
    background[80:660, 160:166] = COURT_LINE
    background[80:660, 1114:1120] = COURT_LINE
    background[80:660, 640:646] = COURT_LINE
    # The key (paint), drawn as a rectangle outline.
    background[80:660, 380:386] = BRAND
    background[80:660, 900:906] = BRAND
    background[300:306, 380:906] = BRAND
    # The rim: a small circle at the centre of the baseline.
    _circle(background, 640, 130, 26, BRAND)


def _circle(canvas: np.ndarray, cx: int, cy: int, radius: int, colour: tuple[int, int, int]) -> None:
    """Filled circle, pure numpy. Clipped to the canvas edges rather than raising."""
    ys, xs = np.ogrid[: canvas.shape[0], : canvas.shape[1]]
    mask = (xs - cx) ** 2 + (ys - cy) ** 2 <= radius**2
    canvas[mask] = colour


def moving_position(frame: int) -> tuple[int, int]:
    """A smooth arc across the key: x sweeps left to right, y follows a shallow parabola."""
    progress = frame / max(1, FRAME_COUNT - 1)
    x = int(200 + progress * 880)
    y = int(520 - 160 * math.sin(math.pi * progress))
    return x, y


def _figure(canvas: np.ndarray, x: int, y: int) -> None:
    """A human silhouette at a size a person detector can actually see.

    The first version was 44 px wide and 150 px tall - smaller than the head of a real player at this resolution -
    and YOLOv8n found nothing. This one is ~90 x 280 px with human proportions (head, shoulders, torso, arms, legs)
    and clothing colours, which is the smallest change that gives the detector a fair test rather than a rigged one.
    """
    head_r = 22
    _circle(canvas, x, y - 128, head_r, (156, 176, 196))        # head
    canvas[y - 104 : y + 6, x - 34 : x + 34] = (60, 90, 140)     # torso (dark blue top)
    canvas[y - 104 : y - 92, x - 46 : x - 30] = (60, 90, 140)    # left shoulder
    canvas[y - 104 : y - 92, x + 30 : x + 46] = (60, 90, 140)    # right shoulder
    canvas[y - 100 : y + 10, x - 52 : x - 38] = (156, 176, 196)  # left arm
    canvas[y - 100 : y + 10, x + 38 : x + 52] = (156, 176, 196)  # right arm
    canvas[y + 6 : y + 140, x - 30 : x - 6] = (40, 44, 52)       # left leg
    canvas[y + 6 : y + 140, x + 6 : x + 30] = (40, 44, 52)       # right leg
    canvas[y + 132 : y + 146, x - 34 : x - 2] = (24, 24, 24)     # left shoe
    canvas[y + 132 : y + 146, x + 2 : x + 34] = (24, 24, 24)     # right shoe


def frames(figure: str = "circle"):
    background = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    half_court(background)
    for frame in range(FRAME_COUNT):
        canvas = background.copy()
        # The static marker: present from the first frame, never moves. A tracker that reports it as moving is
        # wrong, and the ground truth makes that checkable.
        _circle(canvas, 280, 200, 18, STATIC_MARKER)
        x, y = moving_position(frame)
        if figure == "human":
            # The ground truth still describes the moving object at the same position: the point is that the
            # input changed, not the answer.
            _figure(canvas, x, y)
        else:
            _circle(canvas, x, y, 22, ORANGE)
        yield canvas


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a synthetic half-court clip for the vision pipeline.")
    parser.add_argument("--out", default="/tmp/synthetic-court.mp4", help="output mp4 path")
    parser.add_argument("--truth", default=None, help="ground-truth json path (defaults to <out>.truth.json)")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg binary")
    parser.add_argument("--figure", choices=["circle", "human"], default="circle",
                        help="what moves across the court: a plain orange circle, or a crude humanoid")
    args = parser.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    truth_path = Path(args.truth) if args.truth else out.with_suffix(".truth.json")

    command = [
        args.ffmpeg,
        "-y",
        "-loglevel", "error",
        "-f", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-r", str(FPS),
        "-i", "-",
        "-an",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(out),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdin is not None
    truth = {"width": WIDTH, "height": HEIGHT, "fps": FPS, "frames": FRAME_COUNT, "seconds": DURATION_SECONDS, "objects": []}
    try:
        for frame, canvas in enumerate(frames(args.figure)):
            process.stdin.write(canvas.tobytes())
            x, y = moving_position(frame)
            truth["objects"].append({"frame": frame, "moving": [x, y, 22], "static": [280, 200, 18]})
    finally:
        process.stdin.close()
    stderr = process.stderr.read().decode("utf-8", "replace") if process.stderr else ""
    if process.wait() != 0:
        print(f"ffmpeg failed:\n{stderr}", file=sys.stderr)
        return 1

    truth_path.write_text(json.dumps(truth), encoding="utf-8")
    size_bytes = out.stat().st_size
    print(f"wrote {out} ({size_bytes} bytes, {FRAME_COUNT} frames, {FPS} fps, {DURATION_SECONDS}s)")
    print(f"wrote {truth_path} (ground truth for the moving and static circles)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
