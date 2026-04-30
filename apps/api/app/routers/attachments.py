from __future__ import annotations

import contextlib
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import get_current_user, get_session, require_business_access
from app.models import (
    Book,
    Business,
    BusinessMember,
    Entry,
    EntryAttachment,
    MemberRole,
    MemberStatus,
    User,
)
from app.push import notify_business_members
from app.schemas import AttachmentOut, Message

router = APIRouter(
    prefix="/v1/businesses/{business_id}/books/{book_id}/entries/{entry_id}/attachments",
    tags=["attachments"],
)


def _entry_or_404(db: Session, business: Business, book_id: str, entry_id: str) -> Entry:
    book = db.get(Book, book_id)
    if book is None or book.business_id != business.id or book.deleted_at is not None:
        raise HTTPException(status_code=404, detail="book not found")
    entry = db.get(Entry, entry_id)
    if entry is None or entry.book_id != book.id or entry.deleted_at is not None:
        raise HTTPException(status_code=404, detail="entry not found")
    return entry


def _ensure_dir() -> Path:
    settings = get_settings()
    p = Path(settings.attachments_dir).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.get("", response_model=list[AttachmentOut])
def list_attachments(
    book_id: str,
    entry_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> list[AttachmentOut]:
    business, _ = ctx
    entry = _entry_or_404(db, business, book_id, entry_id)
    rows = db.scalars(
        select(EntryAttachment)
        .where(EntryAttachment.entry_id == entry.id)
        .order_by(EntryAttachment.created_at.asc())
    ).all()
    return [AttachmentOut.model_validate(r) for r in rows]


@router.post("", response_model=AttachmentOut, status_code=201)
def upload_attachment(
    book_id: str,
    entry_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> AttachmentOut:
    business, membership = ctx
    if membership.role == MemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="viewers cannot upload attachments")
    entry = _entry_or_404(db, business, book_id, entry_id)

    settings = get_settings()
    max_bytes = settings.max_attachment_mb * 1024 * 1024
    contents = file.file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="empty file")
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"file exceeds {settings.max_attachment_mb}MB limit",
        )

    base_dir = _ensure_dir()
    business_dir = base_dir / business.id
    business_dir.mkdir(parents=True, exist_ok=True)
    suffix = ""
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[1].lower()[:8]
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    target = business_dir / stored_name
    with target.open("wb") as f:
        f.write(contents)

    attachment = EntryAttachment(
        entry_id=entry.id,
        file_url=str(target),
        original_filename=file.filename,
        mime_type=file.content_type,
        size_bytes=len(contents),
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    actor_label = user.name or user.phone
    background.add_task(
        notify_business_members,
        db,
        business.id,
        title="New attachment",
        body=f"{actor_label} attached {file.filename or 'a file'} to an entry.",
        exclude_user_id=user.id,
        data={
            "type": "attachment_uploaded",
            "attachment_id": attachment.id,
            "entry_id": entry.id,
            "book_id": book_id,
            "business_id": business.id,
        },
    )
    return AttachmentOut.model_validate(attachment)


@router.delete("/{attachment_id}", response_model=Message)
def delete_attachment(
    book_id: str,
    entry_id: str,
    attachment_id: str,
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> Message:
    business, membership = ctx
    if membership.role == MemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="viewers cannot delete attachments")
    entry = _entry_or_404(db, business, book_id, entry_id)
    attachment = db.get(EntryAttachment, attachment_id)
    if attachment is None or attachment.entry_id != entry.id:
        raise HTTPException(status_code=404, detail="attachment not found")

    with contextlib.suppress(FileNotFoundError):
        os.unlink(attachment.file_url)
    db.delete(attachment)
    db.commit()
    return Message(detail="attachment deleted")


download_router = APIRouter(prefix="/v1/attachments", tags=["attachments"])


@download_router.get("/{attachment_id}/download")
def download_attachment(
    attachment_id: str,
    db: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> FileResponse:
    """Authenticated download via attachment id; verifies user has access via the entry's book."""
    attachment = db.get(EntryAttachment, attachment_id)
    if attachment is None:
        raise HTTPException(status_code=404, detail="attachment not found")
    entry = db.get(Entry, attachment.entry_id)
    if entry is None or entry.deleted_at is not None:
        raise HTTPException(status_code=404, detail="attachment not found")
    book = db.get(Book, entry.book_id)
    if book is None or book.deleted_at is not None:
        raise HTTPException(status_code=404, detail="attachment not found")
    membership = db.scalar(
        select(BusinessMember).where(
            BusinessMember.business_id == book.business_id,
            BusinessMember.user_id == user.id,
            BusinessMember.status == MemberStatus.ACTIVE,
        )
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="not allowed")
    if not Path(attachment.file_url).exists():
        raise HTTPException(status_code=404, detail="attachment file missing")
    return FileResponse(
        attachment.file_url,
        media_type=attachment.mime_type or "application/octet-stream",
        filename=attachment.original_filename or "attachment",
    )
