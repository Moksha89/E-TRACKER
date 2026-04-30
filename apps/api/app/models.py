from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    # Naive UTC to keep behaviour consistent across SQLite (dev) and Postgres
    # (prod). All callers should treat these as UTC.
    return datetime.now(UTC).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MemberRole(str, enum.Enum):
    OWNER = "owner"
    PARTNER = "partner"
    STAFF = "staff"
    VIEWER = "viewer"


class MemberStatus(str, enum.Enum):
    INVITED = "invited"
    ACTIVE = "active"
    REMOVED = "removed"


class EntryType(str, enum.Enum):
    IN = "in"
    OUT = "out"


class BookType(str, enum.Enum):
    CASHBOOK = "cashbook"
    GENERIC = "generic"


class OtpPurpose(str, enum.Enum):
    SIGNUP = "signup"
    LOGIN = "login"
    RESET_PASSWORD = "reset_password"
    SENSITIVE = "sensitive"


class OtpChannel(str, enum.Enum):
    TELEGRAM_GATEWAY = "telegram_gateway"
    TELEGRAM_BOT = "telegram_bot"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_business_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("businesses.id", use_alter=True, name="fk_users_default_business"),
        nullable=True,
    )
    telegram_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)

    memberships: Mapped[list[BusinessMember]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="BusinessMember.user_id",
    )


class Business(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "businesses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    gst_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)

    members: Mapped[list[BusinessMember]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
        foreign_keys="BusinessMember.business_id",
    )
    books: Mapped[list[Book]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )


class BusinessMember(Base, TimestampMixin):
    __tablename__ = "business_members"
    __table_args__ = (UniqueConstraint("business_id", "user_id", name="uq_business_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    business_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("businesses.id"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    role: Mapped[MemberRole] = mapped_column(Enum(MemberRole), nullable=False)
    status: Mapped[MemberStatus] = mapped_column(
        Enum(MemberStatus), default=MemberStatus.ACTIVE, nullable=False
    )
    invited_by_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    business: Mapped[Business] = relationship(back_populates="members", foreign_keys=[business_id])
    user: Mapped[User] = relationship(back_populates="memberships", foreign_keys=[user_id])


class Book(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "books"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    business_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("businesses.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[BookType] = mapped_column(
        Enum(BookType), default=BookType.CASHBOOK, nullable=False
    )
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    opening_balance_cents: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    business: Mapped[Business] = relationship(back_populates="books")
    entries: Mapped[list[Entry]] = relationship(back_populates="book", cascade="all, delete-orphan")


class Category(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("business_id", "name", name="uq_category_business_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    business_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("businesses.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)


class PaymentMode(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "payment_modes"
    __table_args__ = (
        UniqueConstraint("business_id", "name", name="uq_payment_mode_business_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    business_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("businesses.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)


class Party(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "parties"
    __table_args__ = (Index("ix_party_business_phone", "business_id", "phone"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    business_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("businesses.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Entry(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "entries"
    __table_args__ = (Index("ix_entry_book_occurred", "book_id", "occurred_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    book_id: Mapped[str] = mapped_column(String(36), ForeignKey("books.id"), nullable=False)
    type: Mapped[EntryType] = mapped_column(Enum(EntryType), nullable=False)
    amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    party_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("parties.id"), nullable=True
    )
    category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("categories.id"), nullable=True
    )
    payment_mode_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("payment_modes.id"), nullable=True
    )
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    book: Mapped[Book] = relationship(back_populates="entries")
    attachments: Mapped[list[EntryAttachment]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )


class EntryAttachment(Base, TimestampMixin):
    __tablename__ = "entry_attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    entry_id: Mapped[str] = mapped_column(String(36), ForeignKey("entries.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    entry: Mapped[Entry] = relationship(back_populates="attachments")


class TelegramOtp(Base):
    __tablename__ = "telegram_otps"
    __table_args__ = (Index("ix_otp_phone_purpose", "phone", "purpose"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    purpose: Mapped[OtpPurpose] = mapped_column(Enum(OtpPurpose), nullable=False)
    channel: Mapped[OtpChannel] = mapped_column(Enum(OtpChannel), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    business_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("businesses.id"), nullable=True
    )
    actor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
