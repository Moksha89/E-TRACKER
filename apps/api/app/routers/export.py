from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_session, require_business_access
from app.models import (
    Book,
    Business,
    BusinessMember,
    Category,
    Entry,
    EntryType,
    Party,
    PaymentMode,
)

ExportFormat = Literal["csv", "xlsx", "pdf"]

router = APIRouter(prefix="/v1/businesses/{business_id}", tags=["export"])


def _book_or_404(db: Session, business: Business, book_id: str) -> Book:
    book = db.get(Book, book_id)
    if book is None or book.business_id != business.id or book.deleted_at is not None:
        raise HTTPException(status_code=404, detail="book not found")
    return book


def _money(cents: int, currency: str) -> str:
    return f"{currency} {cents / 100:.2f}"


@dataclass
class ExportRow:
    id: str
    occurred_at: datetime
    type: str
    amount_cents: int
    description: str
    category: str
    payment_mode: str
    party: str


def _fetch_rows(
    db: Session,
    book: Book,
    from_date: datetime | None,
    to_date: datetime | None,
) -> list[ExportRow]:
    filters = [Entry.book_id == book.id, Entry.deleted_at.is_(None)]
    if from_date:
        filters.append(Entry.occurred_at >= from_date)
    if to_date:
        filters.append(Entry.occurred_at <= to_date)

    rows = db.execute(
        select(
            Entry.id,
            Entry.occurred_at,
            Entry.type,
            Entry.amount_cents,
            Entry.description,
            Category.name,
            PaymentMode.name,
            Party.name,
        )
        .select_from(Entry)
        .outerjoin(Category, Category.id == Entry.category_id)
        .outerjoin(PaymentMode, PaymentMode.id == Entry.payment_mode_id)
        .outerjoin(Party, Party.id == Entry.party_id)
        .where(*filters)
        .order_by(Entry.occurred_at.asc(), Entry.created_at.asc())
    ).all()
    return [
        ExportRow(
            id=r[0],
            occurred_at=r[1],
            type=r[2].value if hasattr(r[2], "value") else str(r[2]),
            amount_cents=int(r[3]),
            description=r[4] or "",
            category=r[5] or "",
            payment_mode=r[6] or "",
            party=r[7] or "",
        )
        for r in rows
    ]


def _csv_response(book: Book, items: list[ExportRow]) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "Date",
            "Type",
            "Amount",
            "Description",
            "Category",
            "Payment Mode",
            "Party",
        ]
    )
    for it in items:
        writer.writerow(
            [
                str(it.occurred_at),
                it.type,
                f"{it.amount_cents / 100:.2f}",
                it.description,
                it.category,
                it.payment_mode,
                it.party,
            ]
        )
    buf.seek(0)
    filename = f"{book.name.replace(' ', '_')}-entries.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _xlsx_response(book: Book, items: list[ExportRow]) -> StreamingResponse:
    wb = Workbook()
    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=500, detail="failed to create workbook")
    ws.title = book.name[:31] or "Entries"
    ws.append(["Date", "Type", "Amount", "Description", "Category", "Payment Mode", "Party"])
    in_total = 0
    out_total = 0
    for it in items:
        amount = it.amount_cents / 100
        if it.type == EntryType.IN.value:
            in_total += it.amount_cents
        else:
            out_total += it.amount_cents
        ws.append(
            [
                it.occurred_at,
                it.type,
                amount,
                it.description,
                it.category,
                it.payment_mode,
                it.party,
            ]
        )
    ws.append([])
    ws.append(["", "Cash In", in_total / 100])
    ws.append(["", "Cash Out", out_total / 100])
    ws.append(
        [
            "",
            "Net",
            (book.opening_balance_cents + in_total - out_total) / 100,
        ]
    )
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"{book.name.replace(' ', '_')}-entries.xlsx"
    return StreamingResponse(
        buf,
        media_type=("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(book: Book, items: list[ExportRow]) -> StreamingResponse:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=f"{book.name} - Entries",
    )
    styles = getSampleStyleSheet()
    story: list[object] = []
    story.append(Paragraph(f"<b>{xml_escape(book.name)}</b>", styles["Title"]))
    in_total = sum(i.amount_cents for i in items if i.type == EntryType.IN.value)
    out_total = sum(i.amount_cents for i in items if i.type == EntryType.OUT.value)
    net = book.opening_balance_cents + in_total - out_total
    summary_html = (
        f"Cash In: <b>{xml_escape(_money(in_total, book.currency))}</b> &nbsp;&nbsp; "
        f"Cash Out: <b>{xml_escape(_money(out_total, book.currency))}</b> &nbsp;&nbsp; "
        f"Balance: <b>{xml_escape(_money(net, book.currency))}</b>"
    )
    story.append(Paragraph(summary_html, styles["Normal"]))
    story.append(Spacer(1, 8))

    data: list[list[object]] = [
        ["Date", "Type", "Amount", "Description", "Category", "Mode", "Party"]
    ]
    for it in items:
        data.append(
            [
                str(it.occurred_at),
                it.type,
                _money(it.amount_cents, book.currency),
                it.description[:40],
                it.category[:20],
                it.payment_mode[:20],
                it.party[:20],
            ]
        )
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#16A34A")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    buf.seek(0)
    filename = f"{book.name.replace(' ', '_')}-entries.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/books/{book_id}/entries/export")
def export_entries(
    book_id: str,
    fmt: ExportFormat = Query(default="csv", alias="format"),
    from_date: datetime | None = Query(default=None, alias="from"),
    to_date: datetime | None = Query(default=None, alias="to"),
    db: Session = Depends(get_session),
    ctx: tuple[Business, BusinessMember] = Depends(require_business_access),
) -> StreamingResponse:
    business, _ = ctx
    book = _book_or_404(db, business, book_id)
    items = _fetch_rows(db, book, from_date, to_date)
    if fmt == "csv":
        return _csv_response(book, items)
    if fmt == "xlsx":
        return _xlsx_response(book, items)
    if fmt == "pdf":
        return _pdf_response(book, items)
    raise HTTPException(status_code=400, detail=f"unsupported format: {fmt}")
