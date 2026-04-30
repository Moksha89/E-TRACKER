from collections.abc import Iterator

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Business, BusinessMember, MemberStatus, User
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/login", auto_error=False)


def get_session() -> Iterator[Session]:
    yield from get_db()


def _user_from_token(db: Session, token: str) -> User:
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


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_session),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    return _user_from_token(db, token)


def get_current_user_with_query_token(
    header_token: str | None = Depends(oauth2_scheme),
    query_token: str | None = Query(default=None, alias="token"),
    db: Session = Depends(get_session),
) -> User:
    """Same as get_current_user but also accepts ``?token=...`` query param.

    Useful for endpoints that are loaded by HTML elements (e.g. <Image src=...>)
    that cannot set custom Authorization headers.
    """
    token = header_token or query_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    return _user_from_token(db, token)


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
