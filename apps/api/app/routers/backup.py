from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_session, require_business_access
from app.models import (
    Book,
    Business,
    BusinessMember,
    Category,
    Entry,
    EntryAttachment,
    MemberRole,
    Party,
    PaymentMode,
)

router = APIRouter(prefix="/v1/businesses/{business_id}", tags=["backup"])


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d is not None else None


@router.get("/backup")
def export_backup(
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> dict[str, Any]:
    """Owner / partner only. Returns the entire business snapshot as JSON."""
    business, membership = ctx
    if membership.role not in {MemberRole.OWNER, MemberRole.PARTNER}:
        raise HTTPException(status_code=403, detail="only owners and partners can export backups")

    books = db.scalars(
        select(Book).where(Book.business_id == business.id, Book.deleted_at.is_(None))
    ).all()
    book_ids = [b.id for b in books]

    entries = (
        db.scalars(
            select(Entry).where(Entry.book_id.in_(book_ids), Entry.deleted_at.is_(None))
        ).all()
        if book_ids
        else []
    )
    entry_ids = [e.id for e in entries]

    attachments = (
        db.scalars(select(EntryAttachment).where(EntryAttachment.entry_id.in_(entry_ids))).all()
        if entry_ids
        else []
    )

    categories = db.scalars(
        select(Category).where(Category.business_id == business.id, Category.deleted_at.is_(None))
    ).all()
    payment_modes = db.scalars(
        select(PaymentMode).where(
            PaymentMode.business_id == business.id, PaymentMode.deleted_at.is_(None)
        )
    ).all()
    parties = db.scalars(
        select(Party).where(Party.business_id == business.id, Party.deleted_at.is_(None))
    ).all()

    return {
        "version": 1,
        "exported_at": datetime.now(UTC).replace(tzinfo=None).isoformat(),
        "business": {
            "id": business.id,
            "name": business.name,
            "currency": business.currency,
            "gst_number": business.gst_number,
            "address": business.address,
        },
        "books": [
            {
                "id": b.id,
                "name": b.name,
                "type": b.type.value if hasattr(b.type, "value") else b.type,
                "currency": b.currency,
                "opening_balance_cents": b.opening_balance_cents,
                "archived_at": _iso(b.archived_at),
                "created_at": _iso(b.created_at),
            }
            for b in books
        ],
        "categories": [
            {
                "id": c.id,
                "name": c.name,
                "color": c.color,
                "icon": c.icon,
                "sort_order": c.sort_order,
            }
            for c in categories
        ],
        "payment_modes": [
            {"id": p.id, "name": p.name, "sort_order": p.sort_order} for p in payment_modes
        ],
        "parties": [
            {"id": p.id, "name": p.name, "phone": p.phone, "note": p.note} for p in parties
        ],
        "entries": [
            {
                "id": e.id,
                "book_id": e.book_id,
                "type": e.type.value if hasattr(e.type, "value") else e.type,
                "amount_cents": e.amount_cents,
                "occurred_at": _iso(e.occurred_at),
                "description": e.description,
                "party_id": e.party_id,
                "category_id": e.category_id,
                "payment_mode_id": e.payment_mode_id,
                "created_by_id": e.created_by_id,
                "created_at": _iso(e.created_at),
                "updated_at": _iso(e.updated_at),
            }
            for e in entries
        ],
        "attachments": [
            {
                "id": a.id,
                "entry_id": a.entry_id,
                "original_filename": a.original_filename,
                "mime_type": a.mime_type,
                "size_bytes": a.size_bytes,
                "created_at": _iso(a.created_at),
            }
            for a in attachments
        ],
    }
