"""Find a Fal endpoint that actually exists, before wiring anything to a made-up model id."""

import os

import httpx

KEY = os.environ["FAL_KEY"]
HEADERS = {"Authorization": f"Key {KEY}"}

CANDIDATES = [
    "fal-ai/yolov8",
    "fal-ai/yolov8n",
    "fal-ai/yolo",
    "fal-ai/yolo-world",
    "fal-ai/object-detection",
    "fal-ai/vision-object-detection",
    "fal-ai/person-detection",
    "fal-ai/grounding-dino",
    "fal-ai/florence-2-large",
]

print("== model catalogue query:")
try:
    response = httpx.get("https://api.fal.ai/v1/models", headers=HEADERS, params={"keywords": "yolo"}, timeout=20)
    print("  GET /v1/models ->", response.status_code, response.text[:200])
except httpx.HTTPError as error:
    print("  catalogue error:", error)

print("== endpoint probe (a 404 means the app does not exist):")
for model in CANDIDATES:
    try:
        response = httpx.post(
            f"https://queue.fal.run/{model}",
            headers={**HEADERS, "Content-Type": "application/json"},
            json={"video_url": "https://example.com/x.mp4"},
            timeout=20,
        )
        print(f"  {model}: {response.status_code} {response.text[:120]}")
    except httpx.HTTPError as error:
        print(f"  {model}: transport error {error}")
