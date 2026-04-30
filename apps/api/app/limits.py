"""Per-IP / per-user rate limiter via slowapi.

We attach a global default limit through `SlowAPIMiddleware`, sized for normal
client traffic. Auth and write endpoints can additionally opt in via the
`auth_limit` / `write_limit` decorators when they accept `request: Request`.

When `REDIS_URL` is configured we use Redis as the storage backend so limits
are shared across worker processes. Without Redis we fall back to in-memory
counters (per-worker only — fine for single-worker dev).

Limits are disabled in tests via `RATE_LIMIT_ENABLED=false`.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

from app.config import get_settings

_settings = get_settings()


def _key_func(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"u:{user_id}"
    return f"ip:{get_remote_address(request)}"


def _build_limiter() -> Limiter:
    storage_uri = _settings.redis_url or "memory://"
    enabled = _settings.rate_limit_enabled and _settings.environment != "test"
    return Limiter(
        key_func=_key_func,
        storage_uri=storage_uri,
        default_limits=[_settings.rate_limit_default] if enabled else [],
        enabled=enabled,
    )


limiter = _build_limiter()


async def _rate_limit_exceeded_handler(_request: Request, exc: Exception) -> Response:
    detail = "rate limit exceeded"
    if isinstance(exc, RateLimitExceeded):
        detail = f"rate limit exceeded: {exc.detail}"
    return JSONResponse(status_code=429, content={"detail": detail})


def attach(app: FastAPI) -> None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)


def auth_limit() -> Any:
    return limiter.limit(_settings.rate_limit_auth)


def write_limit() -> Any:
    return limiter.limit(_settings.rate_limit_writes)


__all__ = ["attach", "auth_limit", "limiter", "write_limit"]
