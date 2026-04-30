"""WebSocket endpoint for realtime updates.

Clients connect to ``/v1/ws?token=<jwt>&business_id=<id>``. The server
validates membership, registers the socket with the in-memory broker, and
echoes a hello frame. Server then pushes JSON events of the form::

    {"type": "entry.created", "business_id": "...", "data": {...}}

Heartbeats: client should send ``{"type":"ping"}`` periodically; server
replies with ``{"type":"pong"}``. Any other inbound message is ignored.
"""

from __future__ import annotations

import contextlib
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from starlette.websockets import WebSocketState

from app.db import get_db
from app.deps import _user_from_token
from app.models import Business, BusinessMember, MemberStatus
from app.realtime import register, unregister

logger = logging.getLogger("etracker.ws")

router = APIRouter(tags=["realtime"])


@router.websocket("/v1/ws")
async def realtime_ws(
    websocket: WebSocket,
    token: str = Query(...),
    business_id: str = Query(...),
) -> None:
    db = next(get_db())
    try:
        try:
            user = _user_from_token(db, token)
        except Exception:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        business = db.get(Business, business_id)
        if business is None or business.deleted_at is not None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        membership = db.scalar(
            select(BusinessMember).where(
                BusinessMember.business_id == business_id,
                BusinessMember.user_id == user.id,
                BusinessMember.status == MemberStatus.ACTIVE,
            )
        )
        if membership is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    finally:
        db.close()

    await websocket.accept()
    await register(business_id, websocket)
    try:
        await websocket.send_json({"type": "hello", "business_id": business_id})
        while True:
            msg = await websocket.receive_json()
            if isinstance(msg, dict) and msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("ws closed unexpectedly: %s", exc)
    finally:
        await unregister(business_id, websocket)
        if websocket.client_state != WebSocketState.DISCONNECTED:
            with contextlib.suppress(Exception):
                await websocket.close()
