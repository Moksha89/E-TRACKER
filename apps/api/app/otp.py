"""Telegram-based OTP delivery.

Two channels:

1. **Telegram Gateway** (gateway.telegram.org). Official OTP-by-phone delivery
   via Telegram. Requires `TELEGRAM_GATEWAY_TOKEN`.
2. **Telegram Bot** (placeholder). User starts the bot once and links their
   phone, then OTPs are delivered through the bot. Requires
   `TELEGRAM_BOT_TOKEN` and `User.telegram_user_id` to be set.

If neither token is configured, OTPs are logged to stderr (dev mode) so the
flow can be exercised end-to-end without external services.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from dataclasses import dataclass

import httpx

from app.config import get_settings
from app.models import OtpChannel

logger = logging.getLogger(__name__)
settings = get_settings()


def generate_code(length: int = 6) -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def hash_code(code: str) -> str:
    return hashlib.sha256(f"{settings.jwt_secret}:{code}".encode()).hexdigest()


def verify_code(code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_code(code), code_hash)


@dataclass
class OtpDeliveryResult:
    channel: OtpChannel
    request_id: str | None
    delivered: bool
    detail: str | None = None


def deliver_otp(phone: str, code: str, telegram_user_id: str | None = None) -> OtpDeliveryResult:
    """Best-effort send the OTP via the configured Telegram channel.

    Returns the channel actually used. Falls back to dev-mode logging when no
    credentials are configured so the auth flow remains testable locally.

    Synchronous on purpose so callers can run inside FastAPI's thread pool
    alongside synchronous SQLAlchemy operations without blocking the event
    loop.
    """
    if settings.telegram_gateway_token:
        return _send_via_gateway(phone, code)
    if settings.telegram_bot_token and telegram_user_id:
        return _send_via_bot(telegram_user_id, code)
    logger.warning("[DEV OTP] phone=%s code=%s", phone, code)
    return OtpDeliveryResult(
        channel=OtpChannel.TELEGRAM_GATEWAY,
        request_id=None,
        delivered=False,
        detail="dev-mode: no telegram credentials configured; code logged",
    )


def _send_via_gateway(phone: str, code: str) -> OtpDeliveryResult:
    url = f"{settings.telegram_gateway_base}/sendVerificationMessage"
    headers = {
        "Authorization": f"Bearer {settings.telegram_gateway_token}",
        "Content-Type": "application/json",
    }
    payload = {"phone_number": phone, "code": code, "ttl": settings.otp_ttl_seconds}
    with httpx.Client(timeout=10) as client:
        try:
            resp = client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            logger.error("telegram gateway error: %s", exc)
            return OtpDeliveryResult(
                channel=OtpChannel.TELEGRAM_GATEWAY,
                request_id=None,
                delivered=False,
                detail=str(exc),
            )
    body = resp.json() if resp.content else {}
    if not body.get("ok"):
        return OtpDeliveryResult(
            channel=OtpChannel.TELEGRAM_GATEWAY,
            request_id=None,
            delivered=False,
            detail=str(body),
        )
    request_id = (body.get("result") or {}).get("request_id")
    return OtpDeliveryResult(
        channel=OtpChannel.TELEGRAM_GATEWAY,
        request_id=request_id,
        delivered=True,
    )


def _send_via_bot(telegram_user_id: str, code: str) -> OtpDeliveryResult:
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    text = f"Your E-Tracker verification code is: {code}\nIt expires in {settings.otp_ttl_seconds // 60} minutes."
    with httpx.Client(timeout=10) as client:
        try:
            resp = client.post(url, json={"chat_id": telegram_user_id, "text": text})
        except httpx.HTTPError as exc:
            logger.error("telegram bot error: %s", exc)
            return OtpDeliveryResult(
                channel=OtpChannel.TELEGRAM_BOT,
                request_id=None,
                delivered=False,
                detail=str(exc),
            )
    body = resp.json() if resp.content else {}
    if not body.get("ok"):
        return OtpDeliveryResult(
            channel=OtpChannel.TELEGRAM_BOT,
            request_id=None,
            delivered=False,
            detail=str(body),
        )
    return OtpDeliveryResult(channel=OtpChannel.TELEGRAM_BOT, request_id=None, delivered=True)
