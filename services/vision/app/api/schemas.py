"""Request/response schemas for the vision API (B0)."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    analyzer: str
    database_configured: bool
    storage_configured: bool


class AnalyzeRequest(BaseModel):
    game_video_id: str = Field(..., min_length=1)
    organization_id: str = Field(..., min_length=1)
    requested_by_id: str | None = None


class AnalyzeResponse(BaseModel):
    run_id: str
    status: str
