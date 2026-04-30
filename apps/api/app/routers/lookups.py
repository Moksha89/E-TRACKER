"""Categories, payment modes, and parties — small CRUD scoped to a business."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_session, require_business_access
from app.models import Business, BusinessMember, Category, MemberRole, Party, PaymentMode
from app.schemas import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    PartyCreate,
    PartyOut,
    PartyUpdate,
    PaymentModeCreate,
    PaymentModeOut,
    PaymentModeUpdate,
)

router = APIRouter(prefix="/v1/businesses/{business_id}", tags=["lookups"])


def _writable(membership: BusinessMember) -> None:
    if membership.role == MemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="viewers cannot edit lookups")


# ---------- categories ----------


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    business_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> list[CategoryOut]:
    business, _ = ctx
    rows = db.scalars(
        select(Category)
        .where(Category.business_id == business.id, Category.deleted_at.is_(None))
        .order_by(Category.sort_order, Category.name)
    ).all()
    return [CategoryOut.model_validate(c) for c in rows]


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    business_id: str,
    payload: CategoryCreate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> CategoryOut:
    business, membership = ctx
    _writable(membership)
    cat = Category(
        business_id=business.id,
        name=payload.name,
        color=payload.color,
        icon=payload.icon,
        sort_order=payload.sort_order,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    business_id: str,
    category_id: str,
    payload: CategoryUpdate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> CategoryOut:
    business, membership = ctx
    _writable(membership)
    cat = db.get(Category, category_id)
    if cat is None or cat.business_id != business.id or cat.deleted_at is not None:
        raise HTTPException(status_code=404, detail="category not found")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(cat, f, v)
    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(
    business_id: str,
    category_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> None:
    business, membership = ctx
    _writable(membership)
    cat = db.get(Category, category_id)
    if cat is None or cat.business_id != business.id or cat.deleted_at is not None:
        raise HTTPException(status_code=404, detail="category not found")
    cat.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()


# ---------- payment modes ----------


@router.get("/payment-modes", response_model=list[PaymentModeOut])
def list_payment_modes(
    business_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> list[PaymentModeOut]:
    business, _ = ctx
    rows = db.scalars(
        select(PaymentMode)
        .where(PaymentMode.business_id == business.id, PaymentMode.deleted_at.is_(None))
        .order_by(PaymentMode.sort_order, PaymentMode.name)
    ).all()
    return [PaymentModeOut.model_validate(p) for p in rows]


@router.post("/payment-modes", response_model=PaymentModeOut, status_code=201)
def create_payment_mode(
    business_id: str,
    payload: PaymentModeCreate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> PaymentModeOut:
    business, membership = ctx
    _writable(membership)
    pm = PaymentMode(business_id=business.id, name=payload.name, sort_order=payload.sort_order)
    db.add(pm)
    db.commit()
    db.refresh(pm)
    return PaymentModeOut.model_validate(pm)


@router.patch("/payment-modes/{pm_id}", response_model=PaymentModeOut)
def update_payment_mode(
    business_id: str,
    pm_id: str,
    payload: PaymentModeUpdate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> PaymentModeOut:
    business, membership = ctx
    _writable(membership)
    pm = db.get(PaymentMode, pm_id)
    if pm is None or pm.business_id != business.id or pm.deleted_at is not None:
        raise HTTPException(status_code=404, detail="payment mode not found")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(pm, f, v)
    db.commit()
    db.refresh(pm)
    return PaymentModeOut.model_validate(pm)


@router.delete("/payment-modes/{pm_id}", status_code=204)
def delete_payment_mode(
    business_id: str,
    pm_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> None:
    business, membership = ctx
    _writable(membership)
    pm = db.get(PaymentMode, pm_id)
    if pm is None or pm.business_id != business.id or pm.deleted_at is not None:
        raise HTTPException(status_code=404, detail="payment mode not found")
    pm.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()


# ---------- parties ----------


@router.get("/parties", response_model=list[PartyOut])
def list_parties(
    business_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
    search: str | None = None,
) -> list[PartyOut]:
    business, _ = ctx
    stmt = select(Party).where(Party.business_id == business.id, Party.deleted_at.is_(None))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where((Party.name.ilike(like)) | (Party.phone.ilike(like)))
    rows = db.scalars(stmt.order_by(Party.name)).all()
    return [PartyOut.model_validate(p) for p in rows]


@router.post("/parties", response_model=PartyOut, status_code=201)
def create_party(
    business_id: str,
    payload: PartyCreate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> PartyOut:
    business, membership = ctx
    _writable(membership)
    party = Party(
        business_id=business.id, name=payload.name, phone=payload.phone, note=payload.note
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return PartyOut.model_validate(party)


@router.patch("/parties/{party_id}", response_model=PartyOut)
def update_party(
    business_id: str,
    party_id: str,
    payload: PartyUpdate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> PartyOut:
    business, membership = ctx
    _writable(membership)
    party = db.get(Party, party_id)
    if party is None or party.business_id != business.id or party.deleted_at is not None:
        raise HTTPException(status_code=404, detail="party not found")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(party, f, v)
    db.commit()
    db.refresh(party)
    return PartyOut.model_validate(party)


@router.delete("/parties/{party_id}", status_code=204)
def delete_party(
    business_id: str,
    party_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> None:
    business, membership = ctx
    _writable(membership)
    party = db.get(Party, party_id)
    if party is None or party.business_id != business.id or party.deleted_at is not None:
        raise HTTPException(status_code=404, detail="party not found")
    party.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
