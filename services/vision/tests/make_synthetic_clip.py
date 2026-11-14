"""Generate a small synthetic clip for the parity run.

A moving rectangle is not a person, so YOLO will legitimately return zero detections on it - which still exercises the whole path
(decode, track, box math, observation shaping) and still proves both callers agree. If a real clip is available, prefer it: pass its
path to the parity harness instead.
"""

from __future__ import annotations

import sys

import cv2
import numpy as np

WIDTH, HEIGHT, FPS, FRAMES = 640, 360, 24, 72


def main(path: str) -> None:
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (WIDTH, HEIGHT))
    if not writer.isOpened():
        raise SystemExit(f"cannot open {path} for writing")
    try:
        for frame_index in range(FRAMES):
            frame = np.full((HEIGHT, WIDTH, 3), 24, dtype=np.uint8)
            # A court-ish backdrop plus a moving rectangle: enough motion for a tracker, no promise of being a person.
            cv2.rectangle(frame, (40, 40), (WIDTH - 40, HEIGHT - 40), (70, 70, 70), 2)
            x = 60 + frame_index * 6
            cv2.rectangle(frame, (x, 140), (x + 60, 300), (30, 140, 220), -1)
            cv2.putText(frame, "SYNTHETIC", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
            writer.write(frame)
    finally:
        writer.release()
    print(f"wrote {path} · {FRAMES} frames at {FPS}fps, {WIDTH}x{HEIGHT}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "synthetic.mp4")
