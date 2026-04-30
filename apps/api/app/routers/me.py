from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session
from app.models import Business, BusinessMember, MemberRole, MemberStatus, User
from app.schemas import PasswordChangeRequest, UserOut, UserUpdate
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
    user.password_hash = hash_password(payload.new_password)
    db.commit()


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
