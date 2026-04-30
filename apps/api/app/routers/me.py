from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session
from app.models import Business, BusinessMember, MemberRole, MemberStatus, OtpPurpose, User
from app.routers.auth import consume_otp
from app.schemas import (
    PasswordChangeRequest,
    TwoFactorStatus,
    TwoFactorToggleRequest,
    UserOut,
    UserUpdate,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/v1/me", tags=["me"])


class PendingInvite(BaseModel):
    business_id: str
    business_name: str
    role: MemberRole
    invited_by_id: str | None


@router.get("", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> User:
    fields = payload.model_dump(exclude_unset=True)
    if "default_business_id" in fields and fields["default_business_id"] is not None:
        # validate the user actually belongs to that business
        member = db.scalar(
            select(BusinessMember).where(
                BusinessMember.user_id == user.id,
                BusinessMember.business_id == fields["default_business_id"],
                BusinessMember.status == MemberStatus.ACTIVE,
            )
        )
        if member is None:
            raise HTTPException(status_code=400, detail="not a member of that business")
    for field, value in fields.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/password", status_code=204)
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> None:
    if not user.password_hash or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="current password is incorrect")
    if user.two_factor_enabled:
        if not payload.otp:
            raise HTTPException(status_code=401, detail="otp_required")
        consume_otp(db, user.phone, OtpPurpose.SENSITIVE, payload.otp)
    user.password_hash = hash_password(payload.new_password)
    db.commit()


@router.get("/2fa", response_model=TwoFactorStatus)
def get_two_factor_status(user: User = Depends(get_current_user)) -> TwoFactorStatus:
    return TwoFactorStatus(enabled=user.two_factor_enabled)


@router.post("/2fa", response_model=TwoFactorStatus)
def toggle_two_factor(
    payload: TwoFactorToggleRequest,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> TwoFactorStatus:
    """Enable or disable Telegram-based 2FA. Both directions require a fresh
    SENSITIVE OTP delivered to the caller's verified phone, so an attacker
    holding only the password cannot toggle it off."""
    consume_otp(db, user.phone, OtpPurpose.SENSITIVE, payload.otp)
    user.two_factor_enabled = bool(payload.enabled)
    db.commit()
    return TwoFactorStatus(enabled=user.two_factor_enabled)


@router.get("/invitations", response_model=list[PendingInvite])
def list_invitations(
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[PendingInvite]:
    rows = db.execute(
        select(BusinessMember, Business)
        .join(Business, Business.id == BusinessMember.business_id)
        .where(
            BusinessMember.user_id == user.id,
            BusinessMember.status == MemberStatus.INVITED,
            Business.deleted_at.is_(None),
        )
        .order_by(BusinessMember.created_at.desc())
    ).all()
    return [
        PendingInvite(
            business_id=b.id,
            business_name=b.name,
            role=m.role,
            invited_by_id=m.invited_by_id,
        )
        for m, b in rows
    ]
