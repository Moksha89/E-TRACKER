from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_session, require_business_access
from app.models import Business, BusinessMember, MemberRole, MemberStatus, User
from app.phone import normalize_phone
from app.push import notify_user
from app.schemas import MemberInvite, MemberOut, MemberUpdate, Message
from app.security import hash_password

router = APIRouter(
    prefix="/v1/businesses/{business_id}/members",
    tags=["members"],
)


def _to_out(m: BusinessMember, user: User | None = None) -> MemberOut:
    u = user or m.user
    return MemberOut.model_validate(
        {
            "id": m.id,
            "business_id": m.business_id,
            "user_id": m.user_id,
            "role": m.role,
            "status": m.status.value if hasattr(m.status, "value") else m.status,
            "user_phone": u.phone if u else None,
            "user_name": u.name if u else None,
            "created_at": m.created_at,
        }
    )


def _require_owner_or_partner(membership: BusinessMember) -> None:
    if membership.role not in {MemberRole.OWNER, MemberRole.PARTNER}:
        raise HTTPException(
            status_code=403,
            detail="only owners and partners can manage members",
        )


def _require_owner(membership: BusinessMember) -> None:
    if membership.role != MemberRole.OWNER:
        raise HTTPException(status_code=403, detail="only the owner can perform this action")


@router.get("", response_model=list[MemberOut])
def list_members(
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> list[MemberOut]:
    business, _ = ctx
    rows = db.execute(
        select(BusinessMember, User)
        .join(User, User.id == BusinessMember.user_id)
        .where(
            BusinessMember.business_id == business.id,
            BusinessMember.status != MemberStatus.REMOVED,
        )
        .order_by(BusinessMember.created_at.asc())
    ).all()
    return [_to_out(m, u) for m, u in rows]


@router.post("", response_model=MemberOut, status_code=201)
def invite_member(
    payload: MemberInvite,
    background: BackgroundTasks,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> MemberOut:
    business, membership = ctx
    _require_owner_or_partner(membership)

    if payload.role == MemberRole.OWNER:
        raise HTTPException(status_code=400, detail="cannot invite another owner")

    try:
        phone = normalize_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target = db.scalar(select(User).where(User.phone == phone))
    if target is None:
        # Pre-create a user with a random password hash; they'll set their real
        # password on first login (via OTP -> reset flow).
        import secrets

        random_pw = secrets.token_urlsafe(24)
        target = User(
            phone=phone,
            password_hash=hash_password(random_pw),
            name=payload.name,
            phone_verified=False,
        )
        db.add(target)
        db.flush()

    existing = db.scalar(
        select(BusinessMember).where(
            BusinessMember.business_id == business.id,
            BusinessMember.user_id == target.id,
        )
    )
    if existing is not None:
        if existing.status == MemberStatus.REMOVED:
            existing.status = MemberStatus.INVITED
            existing.role = payload.role
            existing.invited_by_id = membership.user_id
            db.commit()
            db.refresh(existing)
            background.add_task(
                notify_user,
                db,
                target.id,
                title=f"Re-invited to {business.name}",
                body=f"You've been re-invited as {payload.role.value}.",
                data={
                    "type": "member_invite",
                    "business_id": business.id,
                    "member_id": existing.id,
                },
            )
            return _to_out(existing, target)
        raise HTTPException(status_code=409, detail="user is already a member")

    member = BusinessMember(
        business_id=business.id,
        user_id=target.id,
        role=payload.role,
        status=MemberStatus.INVITED,
        invited_by_id=membership.user_id,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    background.add_task(
        notify_user,
        db,
        target.id,
        title=f"Invited to {business.name}",
        body=f"You've been added as {payload.role.value}. Open the app to accept.",
        data={
            "type": "member_invite",
            "business_id": business.id,
            "member_id": member.id,
        },
    )
    return _to_out(member, target)


@router.patch("/{member_id}", response_model=MemberOut)
def update_member(
    member_id: str,
    payload: MemberUpdate,
    background: BackgroundTasks,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> MemberOut:
    business, membership = ctx
    _require_owner(membership)

    if payload.role == MemberRole.OWNER:
        raise HTTPException(status_code=400, detail="ownership transfer is not yet supported")

    member = db.get(BusinessMember, member_id)
    if member is None or member.business_id != business.id:
        raise HTTPException(status_code=404, detail="member not found")
    if member.role == MemberRole.OWNER:
        raise HTTPException(status_code=400, detail="cannot demote the owner")

    old_role = member.role
    member.role = payload.role
    db.commit()
    db.refresh(member)
    if old_role != payload.role:
        background.add_task(
            notify_user,
            db,
            member.user_id,
            title=f"Role updated in {business.name}",
            body=f"You're now a {payload.role.value}.",
            data={
                "type": "member_role_changed",
                "business_id": business.id,
                "member_id": member.id,
                "role": payload.role.value,
            },
        )
    return _to_out(member)


@router.delete("/{member_id}", response_model=Message)
def remove_member(
    member_id: str,
    background: BackgroundTasks,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> Message:
    business, membership = ctx
    _require_owner_or_partner(membership)

    member = db.get(BusinessMember, member_id)
    if member is None or member.business_id != business.id:
        raise HTTPException(status_code=404, detail="member not found")
    if member.role == MemberRole.OWNER:
        raise HTTPException(status_code=400, detail="cannot remove the owner")
    if member.user_id == membership.user_id:
        raise HTTPException(status_code=400, detail="use the leave endpoint to remove yourself")
    # Partners can only remove staff/viewers, not other partners.
    if membership.role == MemberRole.PARTNER and member.role == MemberRole.PARTNER:
        raise HTTPException(status_code=403, detail="partners cannot remove other partners")

    removed_user_id = member.user_id
    member.status = MemberStatus.REMOVED
    db.commit()
    background.add_task(
        notify_user,
        db,
        removed_user_id,
        title=f"Removed from {business.name}",
        body="Your access to this business has been revoked.",
        data={
            "type": "member_removed",
            "business_id": business.id,
            "member_id": member.id,
        },
    )
    return Message(detail="member removed")


@router.post("/accept", response_model=MemberOut)
def accept_invite(
    business_id: str,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> MemberOut:
    """Activate the calling user's invited membership in this business."""
    business = db.get(Business, business_id)
    if business is None or business.deleted_at is not None:
        raise HTTPException(status_code=404, detail="business not found")
    membership = db.scalar(
        select(BusinessMember).where(
            BusinessMember.business_id == business.id,
            BusinessMember.user_id == user.id,
        )
    )
    if membership is None or membership.status == MemberStatus.REMOVED:
        raise HTTPException(status_code=404, detail="no invitation found for this business")
    if membership.status == MemberStatus.ACTIVE:
        return _to_out(membership, user)
    membership.status = MemberStatus.ACTIVE
    db.commit()
    db.refresh(membership)
    return _to_out(membership, user)
