"""Structured logging + optional Sentry initialisation.

Idempotent: safe to call `configure()` multiple times. Honours `LOG_FORMAT`
(`text` or `json`) and `SENTRY_DSN` from settings.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

from pythonjsonlogger.json import JsonFormatter

from app.config import get_settings

_settings = get_settings()
_configured = False


def _build_handler() -> logging.Handler:
    handler = logging.StreamHandler(stream=sys.stdout)
    if _settings.log_format == "json":
        formatter: logging.Formatter = JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"levelname": "level", "asctime": "ts"},
        )
    else:
        formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    handler.setFormatter(formatter)
    return handler


def configure() -> None:
    global _configured
    if _configured:
        return
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    # Replace existing handlers so we don't double-print under uvicorn.
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(_build_handler())
    # Quiet noisy libs.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    _configured = True
    _init_sentry()


def _init_sentry() -> None:
    if not _settings.sentry_dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        logging.getLogger(__name__).warning("sentry-sdk not installed; skipping Sentry init")
        return
    init_kwargs: dict[str, Any] = {
        "dsn": _settings.sentry_dsn,
        "environment": _settings.environment,
        "traces_sample_rate": _settings.sentry_traces_sample_rate,
        "integrations": [StarletteIntegration(), FastApiIntegration()],
        "send_default_pii": False,
    }
    sentry_sdk.init(**init_kwargs)
