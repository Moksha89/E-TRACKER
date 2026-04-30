from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session
from app.models import Business, BusinessMember, MemberRole, MemberStatus, User
from app.schemas import UserOut

router = APIRouter(prefix="/v1/me", tags=["me"])


class PendingInvite(BaseModel):
    business_id: str
    business_name: str
    role: MemberRole
    invited_by_id: str | None


@router.get("", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)) -> User:
    return user


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
