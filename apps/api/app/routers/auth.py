from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import get_session
from app.models import OtpChannel, OtpPurpose, TelegramOtp, User
from app.otp import OtpDeliveryResult, deliver_otp, generate_code, hash_code, verify_code
from app.phone import normalize_phone
from app.schemas import (
    LoginRequest,
    OtpRequest,
    OtpRequestResponse,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
    UserOut,
)
from app.security import create_access_token, hash_password, verify_password

settings = get_settings()
router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _require_phone(raw: str) -> str:
    try:
        return normalize_phone(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _consume_otp(db: Session, phone: str, purpose: OtpPurpose, code: str) -> TelegramOtp:
    otp = db.scalar(
        select(TelegramOtp)
        .where(
            TelegramOtp.phone == phone,
            TelegramOtp.purpose == purpose,
            TelegramOtp.consumed_at.is_(None),
        )
        .order_by(TelegramOtp.sent_at.desc())
    )
    if otp is None:
        raise HTTPException(status_code=400, detail="no active otp; request a new code")
    if otp.expires_at < _now():
        raise HTTPException(status_code=400, detail="otp expired")
    if otp.attempts >= settings.otp_max_attempts:
        raise HTTPException(status_code=429, detail="too many attempts")
    otp.attempts += 1
    if not verify_code(code, otp.code_hash):
        db.commit()
        raise HTTPException(status_code=400, detail="invalid code")
    otp.consumed_at = _now()
    db.commit()
    return otp


# Public alias so other routers can require a fresh SENSITIVE OTP for the
# caller's phone (used by 2FA and password change).
def consume_otp(db: Session, phone: str, purpose: OtpPurpose, code: str) -> TelegramOtp:
    return _consume_otp(db, phone, purpose, code)


@router.post("/otp/request", response_model=OtpRequestResponse)
def request_otp(payload: OtpRequest, db: Session = Depends(get_session)) -> OtpRequestResponse:
    phone = _require_phone(payload.phone)

    existing = db.scalar(
        select(TelegramOtp)
        .where(TelegramOtp.phone == phone, TelegramOtp.purpose == payload.purpose)
        .order_by(TelegramOtp.sent_at.desc())
    )
    if existing is not None:
        delta = (_now() - existing.sent_at).total_seconds()
        if delta < settings.otp_resend_cooldown_seconds and existing.consumed_at is None:
            raise HTTPException(
                status_code=429,
                detail=f"please wait {int(settings.otp_resend_cooldown_seconds - delta)}s before requesting again",
            )

    one_hour_ago = _now() - timedelta(hours=1)
    recent_count = (
        db.scalar(
            select(func.count())
            .select_from(TelegramOtp)
            .where(TelegramOtp.phone == phone, TelegramOtp.sent_at >= one_hour_ago)
        )
        or 0
    )
    if recent_count >= settings.otp_max_requests_per_hour:
        raise HTTPException(
            status_code=429,
            detail=f"too many OTP requests; try again later (max {settings.otp_max_requests_per_hour}/hour)",
        )

    user = db.scalar(select(User).where(User.phone == phone))
    if payload.purpose in {OtpPurpose.LOGIN, OtpPurpose.RESET_PASSWORD} and user is None:
        raise HTTPException(status_code=404, detail="no account for this phone")

    if settings.otp_dev_fixed_code:
        code = settings.otp_dev_fixed_code
        delivery = OtpDeliveryResult(
            channel=OtpChannel.TELEGRAM_GATEWAY,
            request_id=None,
            delivered=False,
            detail="dev-fixed-code: telegram skipped",
        )
    else:
        code = generate_code()
        delivery = deliver_otp(
            phone, code, telegram_user_id=user.telegram_user_id if user else None
        )
    otp = TelegramOtp(
        phone=phone,
        purpose=payload.purpose,
        channel=delivery.channel,
        code_hash=hash_code(code),
        request_id=delivery.request_id,
        sent_at=_now(),
        expires_at=_now() + timedelta(seconds=settings.otp_ttl_seconds),
    )
    db.add(otp)
    db.commit()
    return OtpRequestResponse(
        channel=delivery.channel,
        request_id=delivery.request_id,
        delivered=delivery.delivered,
        cooldown_seconds=settings.otp_resend_cooldown_seconds,
        expires_in_seconds=settings.otp_ttl_seconds,
        debug_code=(None if (delivery.delivered or settings.environment == "production") else code),
    )


@router.post("/signup", response_model=TokenResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_session)) -> TokenResponse:
    phone = _require_phone(payload.phone)
    if db.scalar(select(User).where(User.phone == phone)) is not None:
        raise HTTPException(status_code=409, detail="phone already registered")
    _consume_otp(db, phone, OtpPurpose.SIGNUP, payload.otp)
    user = User(
        phone=phone,
        password_hash=hash_password(payload.password),
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
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/password/reset", response_model=TokenResponse)
def reset_password(
    payload: ResetPasswordRequest, db: Session = Depends(get_session)
) -> TokenResponse:
    phone = _require_phone(payload.phone)
    user = db.scalar(select(User).where(User.phone == phone))
    if user is None:
        raise HTTPException(status_code=404, detail="no account for this phone")
    _consume_otp(db, phone, OtpPurpose.RESET_PASSWORD, payload.otp)
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))
