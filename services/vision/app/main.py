from fastapi import FastAPI

from app.api.analyze import router as analyze_router
from app.api.health import router as health_router
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(
    title="Ultra League OS — Vision Service",
    version="0.1.0-b0",
    description=(
        "AI vision inference for Ultra Basketball game video. Observe-only: this service never "
        "writes canonical scoring data (GameEvent/PlayerStat/TeamStat/Standing). See "
        "documentation/vision/AI_VISION_ARCHITECTURE.md."
    ),
)

app.include_router(health_router)
app.include_router(analyze_router)
