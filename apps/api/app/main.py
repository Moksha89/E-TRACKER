from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import Base, engine
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
)

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Auto-create tables on first boot when no Alembic history exists. In
    # production we use `alembic upgrade head` instead.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="E-Tracker API", version="0.1.0", lifespan=lifespan)

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
