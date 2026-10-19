# B0 (P14 / Workstream B): AI vision inference service.
# Python pinned to 3.12 per the agreed stack; PyTorch/ONNX Runtime are added in B1/B2 when the
# detector first appears. B0 only needs the service shell, the queue, and the storage adapter.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps kept minimal for B0. B1/B2 will add ffmpeg/libgl for decoding and inference.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app

EXPOSE 8000

# The healthcheck lives in docker-compose.yml, on the API service only. In the image it ran in EVERY
# container built from it - including the Celery worker and beat, which serve no HTTP - so they reported
# "unhealthy" while running perfectly and `docker compose up --wait` could never settle.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
