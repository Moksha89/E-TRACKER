from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session, require_business_access
from app.models import (
    Business,
    BusinessMember,
    Category,
    MemberRole,
    MemberStatus,
    PaymentMode,
    User,
)
from app.schemas import BusinessCreate, BusinessOut, BusinessUpdate

router = APIRouter(prefix="/v1/businesses", tags=["businesses"])


_DEFAULT_CATEGORIES = [
    ("Sales", "#22c55e"),
    ("Purchase", "#ef4444"),
    ("Salary", "#6366f1"),
    ("Rent", "#0ea5e9"),
    ("Utilities", "#a855f7"),
    ("Travel", "#f97316"),
    ("Other", "#64748b"),
]
_DEFAULT_PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card", "Other"]


def _seed_defaults(db: Session, business: Business) -> None:
    for i, (name, color) in enumerate(_DEFAULT_CATEGORIES):
        db.add(Category(business_id=business.id, name=name, color=color, sort_order=i))
    for i, name in enumerate(_DEFAULT_PAYMENT_MODES):
        db.add(PaymentMode(business_id=business.id, name=name, sort_order=i))


def _to_out(business: Business, role: MemberRole | None) -> BusinessOut:
    out = BusinessOut.model_validate(business)
    out.role = role
    return out


@router.post("", response_model=BusinessOut, status_code=201)
def create_business(
    payload: BusinessCreate,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BusinessOut:
    business = Business(
        owner_id=user.id,
        name=payload.name,
        currency=payload.currency,
        gst_number=payload.gst_number,
        address=payload.address,
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
    _seed_defaults(db, business)
    if user.default_business_id is None:
        user.default_business_id = business.id
    db.commit()
    db.refresh(business)
    return _to_out(business, MemberRole.OWNER)


@router.get("", response_model=list[BusinessOut])
def list_businesses(
    db: Session = Depends(get_session), user: User = Depends(get_current_user)
) -> list[BusinessOut]:
    rows = db.execute(
        select(Business, BusinessMember.role)
        .join(BusinessMember, BusinessMember.business_id == Business.id)
        .where(
            BusinessMember.user_id == user.id,
            BusinessMember.status == MemberStatus.ACTIVE,
            Business.deleted_at.is_(None),
        )
        .order_by(Business.created_at.asc())
    ).all()
    return [_to_out(b, role) for b, role in rows]


@router.patch("/{business_id}", response_model=BusinessOut)
def update_business(
    business_id: str,
    payload: BusinessUpdate,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> BusinessOut:
    business, membership = ctx
    if membership.role not in {MemberRole.OWNER, MemberRole.PARTNER}:
        raise HTTPException(status_code=403, detail="not allowed")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(business, field, value)
    db.commit()
    db.refresh(business)
    return _to_out(business, membership.role)


@router.delete("/{business_id}", status_code=204)
def delete_business(
    business_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> None:
    business, membership = ctx
    if membership.role != MemberRole.OWNER:
        raise HTTPException(status_code=403, detail="only the owner can delete this business")
    business.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
