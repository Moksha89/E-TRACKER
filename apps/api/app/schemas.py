from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import BookType, EntryType, MemberRole, OtpChannel, OtpPurpose


class _ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)


# ---------- auth ----------


class OtpRequest(BaseModel):
    phone: str
    purpose: OtpPurpose


class OtpRequestResponse(BaseModel):
    channel: OtpChannel
    request_id: str | None = None
    delivered: bool
    cooldown_seconds: int
    expires_in_seconds: int
    debug_code: str | None = None


class SignupRequest(BaseModel):
    phone: str
    password: str = Field(min_length=6, max_length=128)
    name: str | None = None
    email: EmailStr | None = None
    otp: str = Field(min_length=4, max_length=8)


class LoginRequest(BaseModel):
    phone: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ResetPasswordRequest(BaseModel):
    phone: str
    otp: str
    new_password: str = Field(min_length=6, max_length=128)


class UserOut(_ORM):
    id: str
    phone: str
    name: str | None
    email: str | None
    phone_verified: bool
    default_business_id: str | None


# ---------- business ----------


class BusinessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    currency: str = "INR"
    gst_number: str | None = None
    address: str | None = None


class BusinessUpdate(BaseModel):
    name: str | None = None
    currency: str | None = None
    gst_number: str | None = None
    address: str | None = None


class BusinessOut(_ORM):
    id: str
    name: str
    currency: str
    gst_number: str | None
    address: str | None
    owner_id: str
    role: MemberRole | None = None


# ---------- book ----------


class BookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: BookType = BookType.CASHBOOK
    currency: str = "INR"
    opening_balance_cents: int = 0


class BookUpdate(BaseModel):
    name: str | None = None
    archived: bool | None = None
    opening_balance_cents: int | None = None


class BookOut(_ORM):
    id: str
    business_id: str
    name: str
    type: BookType
    currency: str
    opening_balance_cents: int
    archived_at: datetime | None
    created_at: datetime


class BookWithBalance(BookOut):
    in_total_cents: int
    out_total_cents: int
    net_balance_cents: int
    entry_count: int


# ---------- entries ----------


class EntryCreate(BaseModel):
    type: EntryType
    amount_cents: int = Field(gt=0)
    occurred_at: datetime
    description: str | None = None
    party_id: str | None = None
    category_id: str | None = None
    payment_mode_id: str | None = None


class EntryUpdate(BaseModel):
    type: EntryType | None = None
    amount_cents: int | None = Field(default=None, gt=0)
    occurred_at: datetime | None = None
    description: str | None = None
    party_id: str | None = None
    category_id: str | None = None
    payment_mode_id: str | None = None


class EntryOut(_ORM):
    id: str
    book_id: str
    type: EntryType
    amount_cents: int
    occurred_at: datetime
    description: str | None
    party_id: str | None
    category_id: str | None
    payment_mode_id: str | None
    created_by_id: str
    created_at: datetime
    updated_at: datetime


class EntryListResponse(BaseModel):
    items: list[EntryOut]
    in_total_cents: int
    out_total_cents: int
    net_balance_cents: int
    next_cursor: str | None = None


# ---------- categories / payment modes / parties ----------


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    color: str | None = None
    icon: str | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    sort_order: int | None = None


class CategoryOut(_ORM):
    id: str
    business_id: str
    name: str
    color: str | None
    icon: str | None
    sort_order: int


class PaymentModeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    sort_order: int = 0


class PaymentModeUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None


class PaymentModeOut(_ORM):
    id: str
    business_id: str
    name: str
    sort_order: int


class PartyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str | None = None
    note: str | None = None


class PartyUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    note: str | None = None


class PartyOut(_ORM):
    id: str
    business_id: str
    name: str
    phone: str | None
    note: str | None


# ---------- members ----------


class MemberInvite(BaseModel):
    phone: str
    role: MemberRole = MemberRole.STAFF
    name: str | None = None


class MemberUpdate(BaseModel):
    role: MemberRole


class MemberOut(_ORM):
    id: str
    business_id: str
    user_id: str
    role: MemberRole
    status: str
    user_phone: str | None = None
    user_name: str | None = None
    created_at: datetime


# ---------- reports ----------


class CategoryBreakdown(BaseModel):
    category_id: str | None
    category_name: str
    in_total_cents: int
    out_total_cents: int
    entry_count: int


class PaymentModeBreakdown(BaseModel):
    payment_mode_id: str | None
    payment_mode_name: str
    in_total_cents: int
    out_total_cents: int
    entry_count: int


class PartyBreakdown(BaseModel):
    party_id: str | None
    party_name: str
    in_total_cents: int
    out_total_cents: int
    entry_count: int


class ReportSummary(BaseModel):
    business_id: str
    book_id: str | None = None
    from_date: datetime | None = None
    to_date: datetime | None = None
    in_total_cents: int
    out_total_cents: int
    net_cents: int
    entry_count: int
    by_category: list[CategoryBreakdown]
    by_payment_mode: list[PaymentModeBreakdown]
    by_party: list[PartyBreakdown]


# ---------- shared ----------


class Message(BaseModel):
    detail: str
