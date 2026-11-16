"""Which detection models does Fal actually host? Guess-listing a handful of names was the wrong approach; ask the catalogue."""

import os

import httpx

KEY = os.environ["FAL_KEY"]
HEADERS = {"Authorization": f"Key {KEY}"}

for keyword in ("detection", "segment", "video", "yolo"):
    try:
        response = httpx.get(
            "https://api.fal.ai/v1/models",
            headers=HEADERS,
            params={"keywords": keyword, "page_size": 50},
            timeout=25,
        )
        if response.status_code != 200:
            print(f"  {keyword}: HTTP {response.status_code}")
            continue
        models = response.json().get("models", [])
        print(f"== {keyword}: {len(models)} model(s)")
        for model in models[:12]:
            endpoint = model.get("endpoint_id", "?")
            category = model.get("metadata", {}).get("category", "?")
            print(f"   {endpoint}  [{category}]")
    except httpx.HTTPError as error:
        print(f"  {keyword}: transport error {error}")
