from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.deps import get_session, require_business_access
from app.models import (
    Book,
    Business,
    BusinessMember,
    Category,
    Entry,
    EntryType,
    Party,
    PaymentMode,
)
from app.schemas import (
    CategoryBreakdown,
    PartyBreakdown,
    PaymentModeBreakdown,
    ReportSummary,
)


def _book_or_404(db: Session, business: Business, book_id: str) -> Book:
    book = db.get(Book, book_id)
    if book is None or book.business_id != business.id or book.deleted_at is not None:
        raise HTTPException(status_code=404, detail="book not found")
    return book


def _aggregate(
    db: Session,
    *,
    business_id: str,
    book_id: str | None,
    from_date: datetime | None,
    to_date: datetime | None,
) -> ReportSummary:
    in_sum = func.coalesce(
        func.sum(case((Entry.type == EntryType.IN, Entry.amount_cents), else_=0)),
        0,
    )
    out_sum = func.coalesce(
        func.sum(case((Entry.type == EntryType.OUT, Entry.amount_cents), else_=0)),
        0,
    )

    base_filters = [
        Entry.deleted_at.is_(None),
        Book.business_id == business_id,
        Book.deleted_at.is_(None),
    ]
    if book_id:
        base_filters.append(Entry.book_id == book_id)
    if from_date:
        base_filters.append(Entry.occurred_at >= from_date)
    if to_date:
        base_filters.append(Entry.occurred_at <= to_date)

    totals_row = db.execute(
        select(in_sum, out_sum, func.count(Entry.id))
        .select_from(Entry)
        .join(Book, Book.id == Entry.book_id)
        .where(*base_filters)
    ).one()
    in_total, out_total, count = int(totals_row[0]), int(totals_row[1]), int(totals_row[2])

    cat_rows = db.execute(
        select(
            Entry.category_id,
            Category.name,
            in_sum,
            out_sum,
            func.count(Entry.id),
        )
        .select_from(Entry)
        .join(Book, Book.id == Entry.book_id)
        .outerjoin(Category, Category.id == Entry.category_id)
        .where(*base_filters)
        .group_by(Entry.category_id, Category.name)
    ).all()
    by_category = [
        CategoryBreakdown(
            category_id=row[0],
            category_name=row[1] or "Uncategorized",
            in_total_cents=int(row[2]),
            out_total_cents=int(row[3]),
            entry_count=int(row[4]),
        )
        for row in cat_rows
    ]

    pm_rows = db.execute(
        select(
            Entry.payment_mode_id,
            PaymentMode.name,
            in_sum,
            out_sum,
            func.count(Entry.id),
        )
        .select_from(Entry)
        .join(Book, Book.id == Entry.book_id)
        .outerjoin(PaymentMode, PaymentMode.id == Entry.payment_mode_id)
        .where(*base_filters)
        .group_by(Entry.payment_mode_id, PaymentMode.name)
    ).all()
    by_payment_mode = [
        PaymentModeBreakdown(
            payment_mode_id=row[0],
            payment_mode_name=row[1] or "Unspecified",
            in_total_cents=int(row[2]),
            out_total_cents=int(row[3]),
            entry_count=int(row[4]),
        )
        for row in pm_rows
    ]

    party_rows = db.execute(
        select(
            Entry.party_id,
            Party.name,
            in_sum,
            out_sum,
            func.count(Entry.id),
        )
        .select_from(Entry)
        .join(Book, Book.id == Entry.book_id)
        .outerjoin(Party, Party.id == Entry.party_id)
        .where(*base_filters)
        .group_by(Entry.party_id, Party.name)
    ).all()
    by_party = [
        PartyBreakdown(
            party_id=row[0],
            party_name=row[1] or "No party",
            in_total_cents=int(row[2]),
            out_total_cents=int(row[3]),
            entry_count=int(row[4]),
        )
        for row in party_rows
    ]

    return ReportSummary(
        business_id=business_id,
        book_id=book_id,
        from_date=from_date,
        to_date=to_date,
        in_total_cents=in_total,
        out_total_cents=out_total,
        net_cents=in_total - out_total,
        entry_count=count,
        by_category=sorted(
            by_category,
            key=lambda b: -(b.in_total_cents + b.out_total_cents),
        ),
        by_payment_mode=sorted(
            by_payment_mode,
            key=lambda b: -(b.in_total_cents + b.out_total_cents),
        ),
        by_party=sorted(
            by_party,
            key=lambda b: -(b.in_total_cents + b.out_total_cents),
        ),
    )


router = APIRouter(prefix="/v1/businesses/{business_id}", tags=["reports"])


@router.get("/reports/summary", response_model=ReportSummary)
def business_summary(
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
    from_date: datetime | None = Query(default=None, alias="from"),
    to_date: datetime | None = Query(default=None, alias="to"),
) -> ReportSummary:
    business, _ = ctx
    return _aggregate(
        db,
        business_id=business.id,
        book_id=None,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/books/{book_id}/reports/summary", response_model=ReportSummary)
def book_summary(
    book_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
    from_date: datetime | None = Query(default=None, alias="from"),
    to_date: datetime | None = Query(default=None, alias="to"),
) -> ReportSummary:
    business, _ = ctx
    book = _book_or_404(db, business, book_id)
    return _aggregate(
        db,
        business_id=business.id,
        book_id=book.id,
        from_date=from_date,
        to_date=to_date,
    )
