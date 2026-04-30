from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session, require_business_access
from app.models import (
    Book,
    Business,
    BusinessMember,
    Category,
    Entry,
    EntryType,
    MemberRole,
    Party,
    PaymentMode,
    User,
)
from app.push import entry_summary, notify_business_members
from app.schemas import EntryCreate, EntryListResponse, EntryOut, EntryUpdate

router = APIRouter(prefix="/v1/businesses/{business_id}/books/{book_id}/entries", tags=["entries"])


def _book(db: Session, business: Business, book_id: str) -> Book:
    book = db.get(Book, book_id)
    if book is None or book.business_id != business.id or book.deleted_at is not None:
        raise HTTPException(status_code=404, detail="book not found")
    return book


def _validate_refs(db: Session, business: Business, payload: EntryCreate | EntryUpdate) -> None:
    if payload.party_id:
        party = db.get(Party, payload.party_id)
        if party is None or party.business_id != business.id or party.deleted_at is not None:
            raise HTTPException(status_code=400, detail="invalid party_id")
    if payload.category_id:
        category = db.get(Category, payload.category_id)
        if (
            category is None
            or category.business_id != business.id
            or category.deleted_at is not None
        ):
            raise HTTPException(status_code=400, detail="invalid category_id")
    if payload.payment_mode_id:
        pm = db.get(PaymentMode, payload.payment_mode_id)
        if pm is None or pm.business_id != business.id or pm.deleted_at is not None:
            raise HTTPException(status_code=400, detail="invalid payment_mode_id")


@router.post("", response_model=EntryOut, status_code=201)
def create_entry(
    business_id: str,
    book_id: str,
    payload: EntryCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
    user: User = Depends(get_current_user),
) -> EntryOut:
    business, membership = ctx
    if membership.role == MemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="viewers cannot add entries")
    book = _book(db, business, book_id)
    _validate_refs(db, business, payload)
    entry = Entry(
        book_id=book.id,
        type=payload.type,
        amount_cents=payload.amount_cents,
        occurred_at=payload.occurred_at,
        description=payload.description,
        party_id=payload.party_id,
        category_id=payload.category_id,
        payment_mode_id=payload.payment_mode_id,
        created_by_id=user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    title, body, data = entry_summary(db, entry, user)
    background.add_task(
        notify_business_members,
        db,
        business.id,
        title=title,
        body=body,
        exclude_user_id=user.id,
        data=data,
    )
    return EntryOut.model_validate(entry)


@router.get("", response_model=EntryListResponse)
def list_entries(
    business_id: str,
    book_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
    type: EntryType | None = None,
    party_id: str | None = None,
    category_id: str | None = None,
    payment_mode_id: str | None = None,
    from_date: datetime | None = Query(default=None, alias="from"),
    to_date: datetime | None = Query(default=None, alias="to"),
    search: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> EntryListResponse:
    business, _ = ctx
    book = _book(db, business, book_id)
    base = select(Entry).where(Entry.book_id == book.id, Entry.deleted_at.is_(None))
    filters = []
    if type is not None:
        filters.append(Entry.type == type)
    if party_id:
        filters.append(Entry.party_id == party_id)
    if category_id:
        filters.append(Entry.category_id == category_id)
    if payment_mode_id:
        filters.append(Entry.payment_mode_id == payment_mode_id)
    if from_date:
        filters.append(Entry.occurred_at >= from_date)
    if to_date:
        filters.append(Entry.occurred_at <= to_date)
    if search:
        like = f"%{search.strip()}%"
        filters.append(Entry.description.ilike(like))
    if filters:
        base = base.where(*filters)
    items = db.scalars(
        base.order_by(Entry.occurred_at.desc(), Entry.created_at.desc()).limit(limit).offset(offset)
    ).all()
    totals = db.execute(
        select(
            func.coalesce(
                func.sum(case((Entry.type == EntryType.IN, Entry.amount_cents), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((Entry.type == EntryType.OUT, Entry.amount_cents), else_=0)), 0
            ),
        ).where(Entry.book_id == book.id, Entry.deleted_at.is_(None), *filters)
    ).one()
    in_total, out_total = int(totals[0]), int(totals[1])
    return EntryListResponse(
        items=[EntryOut.model_validate(e) for e in items],
        in_total_cents=in_total,
        out_total_cents=out_total,
        net_balance_cents=in_total - out_total,
        next_cursor=str(offset + limit) if len(items) == limit else None,
    )


@router.get("/{entry_id}", response_model=EntryOut)
def get_entry(
    business_id: str,
    book_id: str,
    entry_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> EntryOut:
    business, _ = ctx
    _book(db, business, book_id)
    entry = db.get(Entry, entry_id)
    if entry is None or entry.book_id != book_id or entry.deleted_at is not None:
        raise HTTPException(status_code=404, detail="entry not found")
    return EntryOut.model_validate(entry)


@router.patch("/{entry_id}", response_model=EntryOut)
def update_entry(
    business_id: str,
    book_id: str,
    entry_id: str,
    payload: EntryUpdate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> EntryOut:
    business, membership = ctx
    if membership.role == MemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="viewers cannot edit entries")
    _book(db, business, book_id)
    entry = db.get(Entry, entry_id)
    if entry is None or entry.book_id != book_id or entry.deleted_at is not None:
        raise HTTPException(status_code=404, detail="entry not found")
    _validate_refs(db, business, payload)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return EntryOut.model_validate(entry)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    business_id: str,
    book_id: str,
    entry_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> None:
    business, membership = ctx
    if membership.role == MemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="viewers cannot delete entries")
    _book(db, business, book_id)
    entry = db.get(Entry, entry_id)
    if entry is None or entry.book_id != book_id or entry.deleted_at is not None:
        raise HTTPException(status_code=404, detail="entry not found")
    entry.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
