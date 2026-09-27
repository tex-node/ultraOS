"""Celery application (B0). Broker is Redis; the beat schedule polls for analysis-ready videos."""

from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "vision",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=60 * 60 * 4,  # a long game clip; bounded so a stuck job cannot run forever
    beat_schedule={
        "poll-analysis-ready-videos": {
            "task": "app.workers.tasks.poll_ready_videos",
            "schedule": crontab(minute="*/5"),
        },
    },
)
