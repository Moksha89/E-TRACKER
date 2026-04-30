"""Gunicorn config for production deploys.

Usage:
    uv run gunicorn app.main:app -c gunicorn_conf.py

WORKERS sizing rule of thumb is `(2 * CPU) + 1`. Override with
`GUNICORN_WORKERS=N` env var. WebSocket support requires the uvicorn worker.
"""

from __future__ import annotations

import multiprocessing
import os

bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:8000")
workers = int(os.environ.get("GUNICORN_WORKERS", str(multiprocessing.cpu_count() * 2 + 1)))
worker_class = "uvicorn.workers.UvicornWorker"
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "60"))
keepalive = 5
graceful_timeout = 30
accesslog = "-"
errorlog = "-"
preload_app = False  # keep False so each worker rebuilds its own DB engine
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")
