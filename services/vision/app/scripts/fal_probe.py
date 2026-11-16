"""One-off probe: submit the public clip to Fal and report what comes back."""

import time

from app.core.fal_client import FalVisionClient

VIDEO = "https://pub-e130aa56d5b242f68e0574ce9e065d59.r2.dev/vision-tests/fal-test-clip.mp4"

client = FalVisionClient()
print("endpoint:", client.model, flush=True)
try:
    job = client.submit(video_url=VIDEO, frame_stride=5, max_frames=300)
    print("submitted:", job.job_id, job.status, flush=True)
    for _ in range(10):
        time.sleep(6)
        status = client.status(job.job_id)
        print("status:", status.status, flush=True)
        if status.status in {"COMPLETED", "OK", "SUCCESS"}:
            payload = client.result(job.job_id)
            print("result keys:", sorted(payload.keys())[:10], flush=True)
            break
        if status.status in {"FAILED", "ERROR"}:
            print("failed:", str(client.result(job.job_id))[:300], flush=True)
            break
except Exception as error:  # noqa: BLE001 - probe
    print("ERROR:", type(error).__name__, str(error)[:400], flush=True)
