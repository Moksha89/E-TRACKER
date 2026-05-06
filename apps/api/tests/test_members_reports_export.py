from __future__ import annotations

from fastapi.testclient import TestClient


def _signup(client: TestClient, phone: str, name: str = "User") -> str:
    resp = client.post(
        "/v1/auth/signup",
        json={"phone": phone, "pin": "123456", "name": name},
    )
    assert resp.status_code == 200, resp.text
    token: str = resp.json()["access_token"]
    return token


def _create_business(client: TestClient, token: str, name: str = "Acme") -> str:
    resp = client.post(
        "/v1/businesses",
        json={"name": name},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    bid: str = resp.json()["id"]
    return bid


def _create_book(client: TestClient, token: str, business_id: str, name: str = "Daily") -> str:
    resp = client.post(
        f"/v1/businesses/{business_id}/books",
        json={"name": name, "opening_balance_cents": 0},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    bid: str = resp.json()["id"]
    return bid


def _add_entry(
    client: TestClient,
    token: str,
    business_id: str,
    book_id: str,
    *,
    type_: str,
    amount_cents: int,
    occurred_at: str = "2025-01-01T10:00:00Z",
    description: str | None = None,
    category_id: str | None = None,
    payment_mode_id: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "type": type_,
        "amount_cents": amount_cents,
        "occurred_at": occurred_at,
    }
    if description:
        payload["description"] = description
    if category_id:
        payload["category_id"] = category_id
    if payment_mode_id:
        payload["payment_mode_id"] = payment_mode_id
    resp = client.post(
        f"/v1/businesses/{business_id}/books/{book_id}/entries",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    body: dict[str, object] = resp.json()
    return body


def test_invite_accept_and_role_changes(client: TestClient) -> None:
    owner_token = _signup(client, "+919000000010", "Owner")
    biz_id = _create_business(client, owner_token)
    h_owner = {"Authorization": f"Bearer {owner_token}"}

    # Invite a new (not-yet-registered) member by phone.
    invitee_phone = "+919000000011"
    invite_resp = client.post(
        f"/v1/businesses/{biz_id}/members",
        json={"phone": invitee_phone, "role": "staff", "name": "Helper"},
        headers=h_owner,
    )
    assert invite_resp.status_code == 201, invite_resp.text
    member_obj = invite_resp.json()
    assert member_obj["status"] == "invited"
    assert member_obj["role"] == "staff"

    # Owner sees self + invitee in the listing.
    list_resp = client.get(f"/v1/businesses/{biz_id}/members", headers=h_owner)
    assert list_resp.status_code == 200
    members = list_resp.json()
    assert len(members) == 2
    roles = {m["role"] for m in members}
    assert roles == {"owner", "staff"}

    # The invitee "claims" their account by signing up with their own PIN.
    # The pre-created User row (phone_verified=False) is upgraded in place.
    invitee_token = _signup(client, invitee_phone, name="Helper")
    h_invitee = {"Authorization": f"Bearer {invitee_token}"}

    # Invitee accepts the invite.
    accept_resp = client.post(f"/v1/businesses/{biz_id}/members/accept", headers=h_invitee)
    assert accept_resp.status_code == 200, accept_resp.text
    assert accept_resp.json()["status"] == "active"

    # Now the invitee shows up as a business they belong to.
    biz_list = client.get("/v1/businesses", headers=h_invitee).json()
    assert any(b["id"] == biz_id for b in biz_list)

    # Staff cannot promote themselves.
    member_id = member_obj["id"]
    bad = client.patch(
        f"/v1/businesses/{biz_id}/members/{member_id}",
        json={"role": "partner"},
        headers=h_invitee,
    )
    assert bad.status_code == 403

    # Owner can promote staff to partner.
    promote = client.patch(
        f"/v1/businesses/{biz_id}/members/{member_id}",
        json={"role": "partner"},
        headers=h_owner,
    )
    assert promote.status_code == 200, promote.text
    assert promote.json()["role"] == "partner"

    # Owner removes the member.
    rm = client.delete(f"/v1/businesses/{biz_id}/members/{member_id}", headers=h_owner)
    assert rm.status_code == 200

    # The removed member loses access.
    after = client.get(f"/v1/businesses/{biz_id}/members", headers=h_invitee)
    assert after.status_code == 403


def test_reports_summary(client: TestClient) -> None:
    token = _signup(client, "+919000000020", "Reporter")
    biz_id = _create_business(client, token)
    book_id = _create_book(client, token, biz_id)
    headers = {"Authorization": f"Bearer {token}"}

    cats = client.get(f"/v1/businesses/{biz_id}/categories", headers=headers).json()
    pms = client.get(f"/v1/businesses/{biz_id}/payment-modes", headers=headers).json()
    sales = next(c for c in cats if c["name"] == "Sales")
    rent = next(c for c in cats if c["name"] == "Rent")
    cash_pm = next(p for p in pms if p["name"] == "Cash")

    _add_entry(
        client,
        token,
        biz_id,
        book_id,
        type_="in",
        amount_cents=10_000,
        occurred_at="2025-01-05T10:00:00Z",
        category_id=sales["id"],
        payment_mode_id=cash_pm["id"],
    )
    _add_entry(
        client,
        token,
        biz_id,
        book_id,
        type_="in",
        amount_cents=5_000,
        occurred_at="2025-01-06T10:00:00Z",
        category_id=sales["id"],
        payment_mode_id=cash_pm["id"],
    )
    _add_entry(
        client,
        token,
        biz_id,
        book_id,
        type_="out",
        amount_cents=2_500,
        occurred_at="2025-01-10T10:00:00Z",
        category_id=rent["id"],
        payment_mode_id=cash_pm["id"],
    )

    # Business-level summary.
    summary = client.get(
        f"/v1/businesses/{biz_id}/reports/summary",
        headers=headers,
    ).json()
    assert summary["in_total_cents"] == 15_000
    assert summary["out_total_cents"] == 2_500
    assert summary["net_cents"] == 12_500
    assert summary["entry_count"] == 3

    by_cat = {b["category_name"]: b for b in summary["by_category"]}
    assert by_cat["Sales"]["in_total_cents"] == 15_000
    assert by_cat["Rent"]["out_total_cents"] == 2_500

    # Book-level + date filtering — only the first IN entry.
    book_summary = client.get(
        f"/v1/businesses/{biz_id}/books/{book_id}/reports/summary",
        params={"from": "2025-01-01T00:00:00", "to": "2025-01-05T23:59:59"},
        headers=headers,
    ).json()
    assert book_summary["in_total_cents"] == 10_000
    assert book_summary["out_total_cents"] == 0
    assert book_summary["entry_count"] == 1


def test_export_formats(client: TestClient) -> None:
    token = _signup(client, "+919000000030", "Exporter")
    biz_id = _create_business(client, token)
    book_id = _create_book(client, token, biz_id)
    headers = {"Authorization": f"Bearer {token}"}
    _add_entry(
        client,
        token,
        biz_id,
        book_id,
        type_="in",
        amount_cents=20_000,
        description="January sales",
    )
    _add_entry(
        client,
        token,
        biz_id,
        book_id,
        type_="out",
        amount_cents=5_000,
        description="Office rent",
    )

    csv_resp = client.get(
        f"/v1/businesses/{biz_id}/books/{book_id}/entries/export",
        params={"format": "csv"},
        headers=headers,
    )
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    body = csv_resp.text
    assert "Date,Time,Type,Amount" in body
    assert "Entered By" in body
    assert "January sales" in body
    assert "Office rent" in body

    xlsx_resp = client.get(
        f"/v1/businesses/{biz_id}/books/{book_id}/entries/export",
        params={"format": "xlsx"},
        headers=headers,
    )
    assert xlsx_resp.status_code == 200
    assert (
        "spreadsheetml" in xlsx_resp.headers["content-type"]
        or "application/octet-stream" in xlsx_resp.headers["content-type"]
    )
    # XLSX is a zip; magic bytes are PK\x03\x04
    assert xlsx_resp.content[:2] == b"PK"

    pdf_resp = client.get(
        f"/v1/businesses/{biz_id}/books/{book_id}/entries/export",
        params={"format": "pdf"},
        headers=headers,
    )
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"].startswith("application/pdf")
    assert pdf_resp.content.startswith(b"%PDF-")
