from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session
from app.models import User, UserDevice
from app.schemas import DeviceOut, DeviceRegister, Message

router = APIRouter(prefix="/v1/me/devices", tags=["devices"])


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


@router.get("", response_model=list[DeviceOut])
def list_devices(
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[DeviceOut]:
    rows = db.scalars(
        select(UserDevice)
        .where(UserDevice.user_id == user.id)
        .order_by(UserDevice.last_seen_at.desc())
    ).all()
    return [DeviceOut.model_validate(r) for r in rows]


@router.post("", response_model=DeviceOut)
def register_device(
    payload: DeviceRegister,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> DeviceOut:
    existing = db.scalar(
        select(UserDevice).where(UserDevice.expo_push_token == payload.expo_push_token)
    )
    if existing is not None:
        existing.user_id = user.id
        existing.platform = payload.platform or existing.platform
        existing.locale = payload.locale or existing.locale
        existing.last_seen_at = _now()
        db.commit()
        db.refresh(existing)
        return DeviceOut.model_validate(existing)
    device = UserDevice(
        user_id=user.id,
        expo_push_token=payload.expo_push_token,
        platform=payload.platform,
        locale=payload.locale,
        last_seen_at=_now(),
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return DeviceOut.model_validate(device)


@router.delete("/{device_id}", response_model=Message)
def remove_device(
    device_id: str,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Message:
    device = db.get(UserDevice, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(status_code=404, detail="device not found")
    db.delete(device)
    db.commit()
    return Message(detail="device removed")
