"""Expo push delivery.

Best-effort: failures are logged, never raised. Tests / dev mode skip the HTTP
call when ``EXPO_PUSH_DRY_RUN`` is set.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Book,
    BusinessMember,
    Entry,
    EntryType,
    MemberStatus,
    User,
    UserDevice,
)

log = logging.getLogger(__name__)

EXPO_PUSH_URL = os.environ.get("EXPO_PUSH_URL", "https://exp.host/--/api/v2/push/send")


def _dry_run() -> bool:
    return os.environ.get("EXPO_PUSH_DRY_RUN", "0") in {"1", "true", "yes"}


def send_to_tokens(
    tokens: list[str],
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget Expo push send to a list of tokens."""
    if not tokens:
        return
    if _dry_run():
        log.info("expo push dry run: %d token(s) — %s / %s", len(tokens), title, body)
        return
    payload = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": "default",
            "priority": "high",
        }
        for token in tokens
    ]
    try:
        with httpx.Client(timeout=8.0) as c:
            resp = c.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
            if resp.status_code >= 400:
                log.warning("expo push failed: %s %s", resp.status_code, resp.text[:300])
    except httpx.HTTPError as exc:
        log.warning("expo push transport error: %s", exc)


def _tokens_for_users(db: Session, user_ids: list[str]) -> list[str]:
    if not user_ids:
        return []
    rows = db.scalars(
        select(UserDevice.expo_push_token).where(UserDevice.user_id.in_(user_ids))
    ).all()
    # Deduplicate while preserving order.
    seen: set[str] = set()
    out: list[str] = []
    for t in rows:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def notify_business_members(
    db: Session,
    business_id: str,
    *,
    title: str,
    body: str,
    exclude_user_id: str | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    """Push to all active members of a business, optionally excluding the actor."""
    q = select(BusinessMember.user_id).where(
        BusinessMember.business_id == business_id,
        BusinessMember.status == MemberStatus.ACTIVE,
    )
    if exclude_user_id:
        q = q.where(BusinessMember.user_id != exclude_user_id)
    user_ids = list(db.scalars(q).all())
    tokens = _tokens_for_users(db, user_ids)
    send_to_tokens(tokens, title, body, data)


def notify_user(
    db: Session,
    user_id: str,
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> None:
    tokens = _tokens_for_users(db, [user_id])
    send_to_tokens(tokens, title, body, data)


def format_amount(cents: int) -> str:
    rupees = cents / 100
    return f"₹{rupees:,.2f}"


def entry_summary(db: Session, entry: Entry, actor: User) -> tuple[str, str, dict[str, Any]]:
    """Build the title / body / data payload for a new-entry push."""
    book = db.get(Book, entry.book_id)
    book_name = book.name if book else "a book"
    direction = "received" if entry.type == EntryType.IN else "spent"
    actor_label = actor.name or actor.phone
    title = f"{book_name}: {format_amount(entry.amount_cents)} {direction}"
    body = f"{actor_label} added a new entry."
    data = {
        "type": "entry_created",
        "entry_id": entry.id,
        "book_id": entry.book_id,
        "business_id": book.business_id if book else None,
    }
    return title, body, data
