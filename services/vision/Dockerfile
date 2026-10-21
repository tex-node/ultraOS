# AI vision inference service (P14 / Workstream B).
#
# B0 was the shell; B1 adds the detector. The image is deliberately large now: torch, torchvision and ultralytics
# are what "run inference" means, and the previous B0 build could not analyse anything.
#
# The CPU-only torch wheels are installed first and on purpose - this service runs on CPU hosts, and pulling the
# default (CUDA) build would add ~2.5 GB of libraries that can never be used here.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# ffmpeg for decoding the clips the model reads, libgl/glib for opencv's runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
# CPU torch first (its own index), then the rest of the requirements.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install -r requirements.txt

# The weights are baked in so a container never needs the network at analysis time. Ultralytics would otherwise
# download yolov8n.pt on first use, which fails in an air-gapped deployment and makes runs non-reproducible.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY app ./app

EXPOSE 8000

# The healthcheck lives in docker-compose.yml, on the API service only. In the image it ran in EVERY
# container built from it - including the Celery worker and beat, which serve no HTTP - so they reported
# "unhealthy" while running perfectly and `docker compose up --wait` could never settle.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
