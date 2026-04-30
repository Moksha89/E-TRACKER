from collections.abc import Iterator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Business, BusinessMember, MemberStatus, User
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/login", auto_error=False)


def get_session() -> Iterator[Session]:
    yield from get_db()


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_session),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token"
        ) from exc
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
    return user


def require_business_access(
    business_id: str,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> tuple[Business, BusinessMember]:
    business = db.get(Business, business_id)
    if business is None or business.deleted_at is not None:
        raise HTTPException(status_code=404, detail="business not found")
    membership = db.scalar(
        select(BusinessMember).where(
            BusinessMember.business_id == business_id,
            BusinessMember.user_id == user.id,
            BusinessMember.status == MemberStatus.ACTIVE,
        )
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="not a member of this business")
    return business, membership
