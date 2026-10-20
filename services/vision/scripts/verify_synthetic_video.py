"""Check the synthetic clip really contains what the generator claims (streak v12, Prompt 3).

    python3 services/vision/scripts/verify_synthetic_video.py /tmp/synthetic-court.mp4

Pure checks, no model: ffprobe for the container, then three decoded frames (first, middle, last) inspected for the
orange circle at the ground-truth position. If those three pass, the asset is what the report says it is - which is
the only thing a synthetic clip can prove on its own.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

WIDTH, HEIGHT = 1280, 720
ORANGE_BGR = (0, 140, 255)
TOLERANCE = 40


def probe(path: Path) -> dict:
    output = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-count_frames",
            "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames,codec_name",
            "-of", "json", str(path),
        ],
        capture_output=True, text=True, check=True,
    ).stdout
    stream = json.loads(output)["streams"][0]
    numerator, denominator = stream["r_frame_rate"].split("/")
    return {
        "width": stream["width"],
        "height": stream["height"],
        "fps": float(numerator) / float(denominator),
        "frames": int(stream["nb_read_frames"]),
        "codec": stream["codec_name"],
    }


def frame_at(path: Path, index: int) -> np.ndarray:
    output = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", str(path),
            "-vf", f"select=eq(n\\,{index})",
            "-vsync", "0", "-frames:v", "1",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-",
        ],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(output, dtype=np.uint8).reshape((HEIGHT, WIDTH, 3))


def orange_centroid(frame: np.ndarray) -> tuple[float, float] | None:
    ys, xs = np.where(np.all(np.abs(frame.astype(int) - np.array(ORANGE_BGR)) <= TOLERANCE, axis=2))
    if len(xs) == 0:
        return None
    return float(xs.mean()), float(ys.mean())


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: verify_synthetic_video.py <video.mp4> [truth.json]", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    truth_path = Path(sys.argv[2]) if len(sys.argv) > 2 else path.with_suffix(".truth.json")
    if not path.exists():
        print(f"missing video: {path}", file=sys.stderr)
        return 1
    truth = json.loads(truth_path.read_text(encoding="utf-8"))
    info = probe(path)
    print(f"container: {info['codec']} {info['width']}x{info['height']} @ {info['fps']:.0f}fps, {info['frames']} frames")

    problems: list[str] = []
    if (info["width"], info["height"]) != (truth["width"], truth["height"]):
        problems.append(f"resolution {info['width']}x{info['height']}, expected {truth['width']}x{truth['height']}")
    if round(info["fps"]) != truth["fps"]:
        problems.append(f"fps {info['fps']}, expected {truth['fps']}")
    if info["frames"] != truth["frames"]:
        problems.append(f"{info['frames']} frames, expected {truth['frames']}")

    for index in (0, truth["frames"] // 2, truth["frames"] - 1):
        frame = frame_at(path, index)
        centroid = orange_centroid(frame)
        expected = truth["objects"][index]["moving"]
        if centroid is None:
            problems.append(f"frame {index}: no orange circle found")
            continue
        dx = abs(centroid[0] - expected[0])
        dy = abs(centroid[1] - expected[1])
        print(f"frame {index:3d}: orange centroid {centroid[0]:.0f},{centroid[1]:.0f} · expected {expected[0]},{expected[1]} · delta {dx:.0f},{dy:.0f}")
        if dx > 30 or dy > 30:
            problems.append(f"frame {index}: the circle is {dx:.0f},{dy:.0f} from where it should be")

    print("")
    print("PASS: the clip is the described asset (resolution, frame count and the moving circle's position)" if not problems else f"FAIL: {'; '.join(problems)}")
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
