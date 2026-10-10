import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import router
from app.services.supabase import MIGRATION_HINT, check_schema

logger = logging.getLogger("app.startup")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if not await check_schema():
        logger.warning("%s", MIGRATION_HINT)
    yield


app = FastAPI(
    title="Personal Expense & Budget Tracker API",
    version="0.1.0",
    description="User-scoped transaction, budget, report, export, and optional AI endpoints.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(router)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
