from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session, require_business_access
from app.models import (
    Book,
    BookType,
    Business,
    BusinessMember,
    Category,
    Entry,
    EntryAttachment,
    EntryType,
    MemberRole,
    MemberStatus,
    Party,
    PaymentMode,
    User,
)
from app.schemas import BusinessOut

router = APIRouter(prefix="/v1/businesses/{business_id}", tags=["backup"])
restore_router = APIRouter(prefix="/v1", tags=["backup"])


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


# ---------- restore ----------


class RestoreRequest(BaseModel):
    snapshot: dict[str, Any]
    name_override: str | None = None


def _enum_value(raw: Any, enum_cls: type[Any], default: Any) -> Any:
    if raw is None:
        return default
    if isinstance(raw, enum_cls):
        return raw
    try:
        return enum_cls(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid enum value: {raw!r}") from exc


@restore_router.post("/restore", response_model=BusinessOut, status_code=201)
def restore_backup(
    payload: RestoreRequest,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BusinessOut:
    """Import a backup snapshot into a brand-new business owned by the caller.

    All ids in the snapshot are remapped to fresh UUIDs; relationships are
    preserved through an internal id map. Attachment file contents are NOT
    restored (the snapshot only carries metadata).
    """
    snap = payload.snapshot
    if not isinstance(snap, dict):
        raise HTTPException(status_code=400, detail="snapshot must be a JSON object")
    if snap.get("version") != 1:
        raise HTTPException(status_code=400, detail="unsupported snapshot version")
    biz_meta = snap.get("business")
    if not isinstance(biz_meta, dict) or not biz_meta.get("name"):
        raise HTTPException(status_code=400, detail="snapshot is missing business metadata")

    business = Business(
        name=payload.name_override or str(biz_meta.get("name")),
        currency=str(biz_meta.get("currency") or "INR"),
        gst_number=biz_meta.get("gst_number"),
        address=biz_meta.get("address"),
        owner_id=user.id,
    )
    db.add(business)
    db.flush()

    db.add(
        BusinessMember(
            business_id=business.id,
            user_id=user.id,
            role=MemberRole.OWNER,
            status=MemberStatus.ACTIVE,
        )
    )

    category_map: dict[str, str] = {}
    for c in snap.get("categories") or []:
        if not isinstance(c, dict) or not c.get("name"):
            continue
        new_cat = Category(
            business_id=business.id,
            name=str(c["name"]),
            color=c.get("color"),
            icon=c.get("icon"),
            sort_order=int(c.get("sort_order") or 0),
        )
        db.add(new_cat)
        db.flush()
        if c.get("id"):
            category_map[str(c["id"])] = new_cat.id

    pm_map: dict[str, str] = {}
    for p in snap.get("payment_modes") or []:
        if not isinstance(p, dict) or not p.get("name"):
            continue
        new_pm = PaymentMode(
            business_id=business.id,
            name=str(p["name"]),
            sort_order=int(p.get("sort_order") or 0),
        )
        db.add(new_pm)
        db.flush()
        if p.get("id"):
            pm_map[str(p["id"])] = new_pm.id

    party_map: dict[str, str] = {}
    for p in snap.get("parties") or []:
        if not isinstance(p, dict) or not p.get("name"):
            continue
        new_party = Party(
            business_id=business.id,
            name=str(p["name"]),
            phone=p.get("phone"),
            note=p.get("note"),
        )
        db.add(new_party)
        db.flush()
        if p.get("id"):
            party_map[str(p["id"])] = new_party.id

    book_map: dict[str, str] = {}
    for b in snap.get("books") or []:
        if not isinstance(b, dict) or not b.get("name"):
            continue
        new_book = Book(
            business_id=business.id,
            name=str(b["name"]),
            type=_enum_value(b.get("type"), BookType, BookType.CASHBOOK),
            currency=str(b.get("currency") or business.currency),
            opening_balance_cents=int(b.get("opening_balance_cents") or 0),
            created_by_id=user.id,
        )
        db.add(new_book)
        db.flush()
        if b.get("id"):
            book_map[str(b["id"])] = new_book.id

    entries_in = snap.get("entries") or []
    for e in entries_in:
        if not isinstance(e, dict):
            continue
        old_book_id = str(e.get("book_id") or "")
        new_book_id = book_map.get(old_book_id)
        if not new_book_id or e.get("amount_cents") is None or e.get("occurred_at") is None:
            continue
        try:
            occurred = datetime.fromisoformat(str(e["occurred_at"]).replace("Z", "+00:00"))
        except ValueError:
            continue
        new_entry = Entry(
            book_id=new_book_id,
            type=_enum_value(e.get("type"), EntryType, EntryType.IN),
            amount_cents=int(e["amount_cents"]),
            occurred_at=occurred,
            description=e.get("description"),
            party_id=party_map.get(str(e["party_id"])) if e.get("party_id") else None,
            category_id=category_map.get(str(e["category_id"])) if e.get("category_id") else None,
            payment_mode_id=(
                pm_map.get(str(e["payment_mode_id"])) if e.get("payment_mode_id") else None
            ),
            created_by_id=user.id,
        )
        db.add(new_entry)

    db.commit()
    db.refresh(business)
    out = BusinessOut.model_validate(business)
    out.role = MemberRole.OWNER
    return out
