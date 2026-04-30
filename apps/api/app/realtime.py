"""In-memory realtime broker for WebSocket fanout.

Maps business_id -> set of connected WebSockets. Each socket is for one user,
scoped to one business they belong to. On any data change in that business
(entry create/update/delete, attachment add/remove, member change, etc.) the
producing endpoint calls :func:`broadcast` to fan out a JSON event to every
other connected socket in that business.

Single-process only. For multi-worker deployments swap this for a Redis
Pub/Sub backed broker (Phase E).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("etracker.realtime")


class _Broker:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()
        self._tasks: set[asyncio.Task[None]] = set()

    async def register(self, business_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.setdefault(business_id, set()).add(ws)

    async def unregister(self, business_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(business_id)
            if not conns:
                return
            conns.discard(ws)
            if not conns:
                self._connections.pop(business_id, None)

    async def _broadcast_async(self, business_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            conns = list(self._connections.get(business_id, ()))
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.unregister(business_id, ws)


_broker = _Broker()
_main_loop: asyncio.AbstractEventLoop | None = None


def set_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Capture the running event loop so sync handlers in threadpool can
    schedule broadcasts via :func:`asyncio.run_coroutine_threadsafe`."""
    global _main_loop
    _main_loop = loop


async def register(business_id: str, ws: WebSocket) -> None:
    await _broker.register(business_id, ws)


async def unregister(business_id: str, ws: WebSocket) -> None:
    await _broker.unregister(business_id, ws)


def broadcast(business_id: str, event: str, data: dict[str, Any] | None = None) -> None:
    """Fire-and-forget broadcast.

    Safe to call from sync request handlers running in a threadpool: schedules
    the async fanout on the captured main event loop via
    :func:`asyncio.run_coroutine_threadsafe`. Silently no-ops if there is no
    running loop available (e.g. before app startup).
    """
    payload = {"type": event, "business_id": business_id, "data": data or {}}
    coro = _broker._broadcast_async(business_id, payload)
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None:
        task = loop.create_task(coro)
        _broker._tasks.add(task)
        task.add_done_callback(_broker._tasks.discard)
        return
    if _main_loop is not None:
        try:
            asyncio.run_coroutine_threadsafe(coro, _main_loop)
        except RuntimeError:
            coro.close()
        return
    coro.close()
