from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session, require_business_access
from app.models import (
    Book,
    Business,
    BusinessMember,
    Entry,
    EntryType,
    MemberRole,
    User,
)
from app.schemas import BookCreate, BookOut, BookUpdate, BookWithBalance

router = APIRouter(prefix="/v1/businesses/{business_id}/books", tags=["books"])


def _book_for_user(db: Session, business: Business, book_id: str) -> Book:
    book = db.get(Book, book_id)
    if book is None or book.business_id != business.id or book.deleted_at is not None:
        raise HTTPException(status_code=404, detail="book not found")
    return book


def _balances_for_book(db: Session, book: Book) -> tuple[int, int, int, int]:
    row = db.execute(
        select(
            func.coalesce(
                func.sum(case((Entry.type == EntryType.IN, Entry.amount_cents), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((Entry.type == EntryType.OUT, Entry.amount_cents), else_=0)), 0
            ),
            func.count(Entry.id),
        ).where(Entry.book_id == book.id, Entry.deleted_at.is_(None))
    ).one()
    in_total, out_total, count = int(row[0]), int(row[1]), int(row[2])
    net = book.opening_balance_cents + in_total - out_total
    return in_total, out_total, net, count


def _to_with_balance(book: Book, totals: tuple[int, int, int, int]) -> BookWithBalance:
    in_total, out_total, net, count = totals
    base = BookOut.model_validate(book).model_dump()
    base.update(
        in_total_cents=in_total,
        out_total_cents=out_total,
        net_balance_cents=net,
        entry_count=count,
    )
    return BookWithBalance(**base)


@router.post("", response_model=BookOut, status_code=201)
def create_book(
    business_id: str,
    payload: BookCreate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
    user: User = Depends(get_current_user),
) -> BookOut:
    business, membership = ctx
    if membership.role == MemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="viewers cannot create books")
    book = Book(
        business_id=business.id,
        name=payload.name,
        type=payload.type,
        currency=payload.currency,
        opening_balance_cents=payload.opening_balance_cents,
        created_by_id=user.id,
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return BookOut.model_validate(book)


@router.get("", response_model=list[BookWithBalance])
def list_books(
    business_id: str,
    include_archived: bool = False,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> list[BookWithBalance]:
    business, _ = ctx
    stmt = select(Book).where(Book.business_id == business.id, Book.deleted_at.is_(None))
    if not include_archived:
        stmt = stmt.where(Book.archived_at.is_(None))
    books = db.scalars(stmt.order_by(Book.created_at.asc())).all()
    return [_to_with_balance(b, _balances_for_book(db, b)) for b in books]


@router.get("/{book_id}", response_model=BookWithBalance)
def get_book(
    business_id: str,
    book_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> BookWithBalance:
    business, _ = ctx
    book = _book_for_user(db, business, book_id)
    return _to_with_balance(book, _balances_for_book(db, book))


@router.patch("/{book_id}", response_model=BookOut)
def update_book(
    business_id: str,
    book_id: str,
    payload: BookUpdate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> BookOut:
    business, membership = ctx
    if membership.role == MemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="viewers cannot edit books")
    book = _book_for_user(db, business, book_id)
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields:
        book.name = fields["name"]
    if "opening_balance_cents" in fields:
        book.opening_balance_cents = fields["opening_balance_cents"]
    if "archived" in fields:
        book.archived_at = datetime.now(UTC).replace(tzinfo=None) if fields["archived"] else None
    db.commit()
    db.refresh(book)
    return BookOut.model_validate(book)


@router.delete("/{book_id}", status_code=204)
def delete_book(
    business_id: str,
    book_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> None:
    business, membership = ctx
    if membership.role not in {MemberRole.OWNER, MemberRole.PARTNER}:
        raise HTTPException(status_code=403, detail="only owners/partners can delete books")
    book = _book_for_user(db, business, book_id)
    book.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
