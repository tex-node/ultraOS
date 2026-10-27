from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration, read from the environment (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    celery_broker_url: str = "redis://vision-redis:6379/0"
    celery_result_backend: str = "redis://vision-redis:6379/1"

    media_s3_endpoint: str = ""
    media_s3_bucket: str = ""
    media_s3_access_key_id: str = ""
    media_s3_secret_access_key: str = ""

    vision_log_level: str = "info"
    # "stub" (B0) is a deterministic no-model analyzer. Real inference lands in B1/B2.
    vision_analyzer: str = "stub"
    # Where a RELATIVE MediaAsset.objectKey resolves inside this container (streak v24): the app stores
    # "originals/<org>/video/<sha>.mp4" and docker-compose mounts the shared media directory here read-only. Before this,
    # the analyzer tried to open the object key as a path relative to /app, which never exists, so every ingested video
    # failed with "cannot open video" even though the file was on disk.
    vision_media_root: str = "/media"


@lru_cache
def get_settings() -> Settings:
    return Settings()
