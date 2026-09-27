"""Storage adapter for pulling video segments (B0: interface + a local/remote stub).

B2 replaces the stub body with real ranged reads from R2/S3. The interface is fixed now so the
analyzer pipeline can be written against it without a later rewrite.
"""

from abc import ABC, abstractmethod

from app.core.config import get_settings


class VideoStorage(ABC):
    @abstractmethod
    def presigned_url(self, media_asset_id: str, ttl_seconds: int = 900) -> str:
        """Return a time-limited URL the worker can range-GET a video from."""

    @abstractmethod
    def download_segment(self, media_asset_id: str, start_ms: int, end_ms: int) -> bytes:
        """Download a time range of the video. Used by the real analyzer in B2."""


class StubVideoStorage(VideoStorage):
    """B0 stub: reports configuration state instead of pretending to fetch bytes."""

    def presigned_url(self, media_asset_id: str, ttl_seconds: int = 900) -> str:
        settings = get_settings()
        if not settings.media_s3_bucket:
            raise RuntimeError("MEDIA_S3_BUCKET is not configured")
        return f"s3://{settings.media_s3_bucket}/{media_asset_id}"

    def download_segment(self, media_asset_id: str, start_ms: int, end_ms: int) -> bytes:
        raise NotImplementedError("VIDEO_SEGMENT_FETCH_NOT_IMPLEMENTED_IN_B0")


def get_video_storage() -> VideoStorage:
    return StubVideoStorage()
