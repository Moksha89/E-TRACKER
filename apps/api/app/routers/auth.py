from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_session
from app.models import User
from app.phone import normalize_phone
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _require_phone(raw: str) -> str:
    try:
        return normalize_phone(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_session)) -> TokenResponse:
    phone = _require_phone(payload.phone)
    existing = db.scalar(select(User).where(User.phone == phone))
    if existing is not None:
        if existing.phone_verified:
            raise HTTPException(status_code=409, detail="phone already registered")
        # An owner/partner invited this phone; claim that account by setting
        # the PIN and marking the phone as verified.
        existing.password_hash = hash_password(payload.pin)
        if payload.name:
            existing.name = payload.name
        if payload.email:
            existing.email = payload.email
        existing.phone_verified = True
        db.commit()
        db.refresh(existing)
        token = create_access_token(existing.id)
        return TokenResponse(access_token=token, user=UserOut.model_validate(existing))
    user = User(
        phone=phone,
        password_hash=hash_password(payload.pin),
        name=payload.name,
        email=payload.email,
        phone_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_session)) -> TokenResponse:
    phone = _require_phone(payload.phone)
    user = db.scalar(select(User).where(User.phone == phone))
    if user is None or not verify_password(payload.pin, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))
