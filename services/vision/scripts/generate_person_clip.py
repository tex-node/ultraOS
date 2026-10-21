"""Generate a clip whose "player" is REAL person pixels (streak v13, Prompt 1).

The flat synthetic silhouette is not person-like enough for COCO YOLOv8n — at conf>=0.05 it calls the figure a
"sports ball" and never a person. That is a property of the input, not of the harness (the same model finds four
people in Ultralytics' reference photo). So this script builds the missing middle ground: real person pixels,
synthetic motion.

    python services/vision/scripts/generate_person_clip.py --source /tmp/bus.jpg --out /tmp/person-clip.mp4

It crops the most confident person YOLO finds in the source photo, scales it to a basketball-plausible height, and
moves it across the half-court background for ten seconds. The ground-truth JSON describes where the person is in
every frame, so the detector's output can be scored against it.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

WIDTH, HEIGHT = 1280, 720
FPS = 30
DURATION_SECONDS = 10
FRAME_COUNT = FPS * DURATION_SECONDS

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_synthetic_video import half_court  # noqa: E402  same court, one definition

INK_900 = (20, 16, 14)


def person_crop(source: Path) -> np.ndarray:
    from ultralytics import YOLO

    image = cv2.imread(str(source))
    if image is None:
        raise SystemExit(f"cannot read {source}")
    model = YOLO("yolov8n.pt")
    results = model.predict(image, classes=[0], conf=0.5, verbose=False)
    boxes = results[0].boxes
    if len(boxes) == 0:
        raise SystemExit("no person found in the source photo")
    # Tallest box = the fullest view of a person.
    xyxy = boxes.xyxy.cpu().numpy()
    areas = (xyxy[:, 2] - xyxy[:, 0]) * (xyxy[:, 3] - xyxy[:, 1])
    x1, y1, x2, y2 = map(int, xyxy[int(np.argmax(areas))])
    return image[y1:y2, x1:x2].copy()


def position(frame: int, person_height: int) -> tuple[int, int]:
    """Where the person's feet are: a walk across the key, slightly closer to the camera at the end."""
    progress = frame / max(1, FRAME_COUNT - 1)
    x = int(240 + progress * 800)
    floor_y = int(560 + 40 * np.sin(np.pi * progress))
    return x, floor_y


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="a photo containing at least one person")
    parser.add_argument("--out", default="/tmp/person-clip.mp4")
    parser.add_argument("--truth", default=None)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()

    person = person_crop(Path(args.source))
    # Scale so the person stands ~300 px tall on a 720 px frame: a player at this camera distance.
    scale = 300 / person.shape[0]
    person = cv2.resize(person, (max(1, int(person.shape[1] * scale)), 300))

    background = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    half_court(background)

    out = Path(args.out)
    truth_path = Path(args.truth) if args.truth else out.with_suffix(".truth.json")
    command = [
        args.ffmpeg, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-",
        "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdin is not None
    truth = {"width": WIDTH, "height": HEIGHT, "fps": FPS, "frames": FRAME_COUNT, "seconds": DURATION_SECONDS, "source": str(args.source), "objects": []}
    height, width = person.shape[:2]
    try:
        for frame in range(FRAME_COUNT):
            canvas = background.copy()
            x, floor_y = position(frame, height)
            top = floor_y - height
            left = x - width // 2
            canvas[top : top + height, left : left + width] = person
            process.stdin.write(canvas.tobytes())
            truth["objects"].append(
                {
                    "frame": frame,
                    "person": [round(left / WIDTH, 5), round(top / HEIGHT, 5), round(width / WIDTH, 5), round(height / HEIGHT, 5)],
                }
            )
    finally:
        process.stdin.close()
    stderr = process.stderr.read().decode("utf-8", "replace") if process.stderr else ""
    if process.wait() != 0:
        print(f"ffmpeg failed:\n{stderr}", file=sys.stderr)
        return 1
    truth_path.write_text(json.dumps(truth), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size} bytes, {FRAME_COUNT} frames) and {truth_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
