from fastapi import APIRouter

from app.api.schemas import HealthResponse
from app.core.config import get_settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        analyzer=settings.vision_analyzer,
        database_configured=bool(settings.database_url),
        storage_configured=bool(settings.media_s3_bucket),
    )
