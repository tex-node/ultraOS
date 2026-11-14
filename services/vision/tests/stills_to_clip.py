"""Turn a still that contains people into a short clip with motion, for the parity run.

The synthetic rectangle produced zero detections - a legitimate answer, but a weak parity test. A still with people, panned across
the frame, gives real detections and real track ids while staying fully reproducible and offline once the still is fetched.
"""

from __future__ import annotations

import sys

import cv2
import numpy as np

FRAMES, FPS = 30, 15


def main(image_path: str, out_path: str) -> None:
    still = cv2.imread(image_path)
    if still is None:
        raise SystemExit(f"cannot read {image_path}")
    height, width = still.shape[:2]
    # Pan a window across a slightly larger canvas so the tracker sees motion rather than identical frames.
    canvas_width = int(width * 1.25)
    canvas = np.zeros((height, canvas_width, 3), dtype=np.uint8)
    canvas[:, :width] = still

    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (width, height))
    if not writer.isOpened():
        raise SystemExit(f"cannot open {out_path}")
    try:
        for index in range(FRAMES):
            offset = int((canvas_width - width) * (index / max(FRAMES - 1, 1)))
            writer.write(canvas[:, offset : offset + width])
    finally:
        writer.release()
    print(f"wrote {out_path} · {FRAMES} frames at {FPS}fps")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
