import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app import limits, observability
from app.config import get_settings
from app.db import Base, engine
from app.realtime import set_main_loop
from app.routers import (
    attachments,
    auth,
    backup,
    books,
    businesses,
    devices,
    entries,
    export,
    lookups,
    me,
    members,
    reports,
    ws,
)

settings = get_settings()
logger = logging.getLogger(__name__)


def _ensure_user_columns() -> None:
    """Idempotently add columns introduced after initial schema bake.

    SQLAlchemy's `create_all` only creates missing tables, never alters
    existing ones. Until Alembic migrations land in Phase E we patch known
    new columns at boot. Safe on both SQLite and Postgres.
    """
    insp = inspect(engine)
    if not insp.has_table("users"):
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    additions: list[str] = []
    if "two_factor_enabled" not in cols:
        additions.append(
            "ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT 0"
        )
    if not additions:
        return
    with engine.begin() as conn:
        for ddl in additions:
            try:
                conn.execute(text(ddl))
                logger.info("schema migration: %s", ddl)
            except Exception:
                logger.exception("schema migration failed: %s", ddl)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Auto-create tables on first boot when no Alembic history exists. In
    # production we use `alembic upgrade head` instead.
    Base.metadata.create_all(bind=engine)
    _ensure_user_columns()
    set_main_loop(asyncio.get_running_loop())
    yield


observability.configure()

app = FastAPI(title="E-Tracker API", version="0.1.0", lifespan=lifespan)
limits.attach(app)

_origins = settings.cors_origin_list
# Browsers reject credentialed requests when allow_origins is "*", so only
# enable allow_credentials when an explicit allowlist is configured.
_allow_credentials = _origins != ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["meta"])
def healthz() -> dict[str, str]:
    return {"status": "ok", "env": settings.environment}


app.include_router(auth.router)
app.include_router(me.router)
app.include_router(businesses.router)
app.include_router(books.router)
app.include_router(export.router)
app.include_router(entries.router)
app.include_router(lookups.router)
app.include_router(members.router)
app.include_router(reports.router)
app.include_router(attachments.router)
app.include_router(attachments.download_router)
app.include_router(backup.router)
app.include_router(backup.restore_router)
app.include_router(devices.router)
app.include_router(ws.router)
