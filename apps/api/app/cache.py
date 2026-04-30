"""Thin Redis cache wrapper with a no-op fallback.

When `REDIS_URL` is unset (dev / single-node), every method becomes a cheap
no-op so callers can use the same code path without conditionals. When set,
the same calls hit Redis with sane defaults (UTF-8 strings, automatic JSON
serialisation, optional TTL).

Designed to be safe to import at module top-level — the actual Redis
connection is lazy.
"""

from __future__ import annotations

import json
import logging
from typing import Any, cast

import redis

from app.config import get_settings

logger = logging.getLogger(__name__)
_settings = get_settings()


class _NoopCache:
    enabled: bool = False

    def get(self, _key: str) -> Any | None:
        return None

    def set(self, _key: str, _value: Any, ttl_seconds: int | None = None) -> None:
        return None

    def delete(self, *_keys: str) -> None:
        return None

    def incr(self, _key: str, ttl_seconds: int | None = None) -> int:
        return 0


class _RedisCache:
    enabled: bool = True

    def __init__(self, url: str) -> None:
        self._client = redis.Redis.from_url(url, decode_responses=True)

    def get(self, key: str) -> Any | None:
        try:
            raw = cast("str | None", self._client.get(key))
        except redis.RedisError:
            logger.exception("redis get failed: %s", key)
            return None
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return raw

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        try:
            payload = json.dumps(value, default=str)
            if ttl_seconds is not None:
                self._client.setex(key, ttl_seconds, payload)
            else:
                self._client.set(key, payload)
        except redis.RedisError:
            logger.exception("redis set failed: %s", key)

    def delete(self, *keys: str) -> None:
        if not keys:
            return
        try:
            self._client.delete(*keys)
        except redis.RedisError:
            logger.exception("redis delete failed: %s", keys)

    def incr(self, key: str, ttl_seconds: int | None = None) -> int:
        try:
            value = int(cast("int", self._client.incr(key)))
            if ttl_seconds is not None and value == 1:
                self._client.expire(key, ttl_seconds)
            return value
        except redis.RedisError:
            logger.exception("redis incr failed: %s", key)
            return 0


def _build() -> _NoopCache | _RedisCache:
    if not _settings.redis_url:
        return _NoopCache()
    try:
        return _RedisCache(_settings.redis_url)
    except Exception:
        logger.exception("redis init failed; falling back to noop cache")
        return _NoopCache()


cache: _NoopCache | _RedisCache = _build()
