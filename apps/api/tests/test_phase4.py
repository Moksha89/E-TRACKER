from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

import app.push as push_mod
import app.routers.attachments as attachments_mod
import app.routers.entries as entries_mod
import app.routers.members as members_mod


def _signup(client: TestClient, phone: str) -> dict[str, str]:
    otp = client.post("/v1/auth/otp/request", json={"phone": phone, "purpose": "signup"}).json()[
        "debug_code"
    ]
    resp = client.post(
        "/v1/auth/signup",
        json={"phone": phone, "password": "secret123", "name": phone, "otp": otp},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _claim(client: TestClient, phone: str) -> dict[str, str]:
    otp = client.post(
        "/v1/auth/otp/request", json={"phone": phone, "purpose": "reset_password"}
    ).json()["debug_code"]
    resp = client.post(
        "/v1/auth/password/reset",
        json={"phone": phone, "otp": otp, "new_password": "secret123"},
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def captured_pushes(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, object]]:
    sent: list[dict[str, object]] = []

    def fake_send(
        tokens: list[str],
        title: str,
        body: str,
        data: dict[str, object] | None = None,
    ) -> None:
        sent.append({"tokens": tokens, "title": title, "body": body, "data": data or {}})

    monkeypatch.setattr(push_mod, "send_to_tokens", fake_send)
    monkeypatch.setattr(entries_mod, "notify_business_members", push_mod.notify_business_members)
    monkeypatch.setattr(members_mod, "notify_user", push_mod.notify_user)
    monkeypatch.setattr(
        attachments_mod, "notify_business_members", push_mod.notify_business_members
    )
    return sent


def _setup_two_member_biz(
    client: TestClient,
) -> tuple[dict[str, str], dict[str, str], dict[str, object], dict[str, object]]:
    owner_h = _signup(client, "+919000000060")
    biz = client.post("/v1/businesses", json={"name": "Acme"}, headers=owner_h).json()
    book = client.post(
        f"/v1/businesses/{biz['id']}/books", json={"name": "Daily"}, headers=owner_h
    ).json()
    partner_phone = "+919000000061"
    inv = client.post(
        f"/v1/businesses/{biz['id']}/members",
        json={"phone": partner_phone, "role": "partner"},
        headers=owner_h,
    )
    assert inv.status_code == 201, inv.text
    partner_h = _claim(client, partner_phone)
    accept = client.post(f"/v1/businesses/{biz['id']}/members/accept", headers=partner_h)
    assert accept.status_code == 200, accept.text

    client.post(
        "/v1/me/devices",
        json={"expo_push_token": "ExponentPushToken[OWNER]", "platform": "ios"},
        headers=owner_h,
    )
    client.post(
        "/v1/me/devices",
        json={"expo_push_token": "ExponentPushToken[PARTNER]", "platform": "android"},
        headers=partner_h,
    )
    return owner_h, partner_h, biz, book


def test_attachment_upload_pushes_other_members(
    client: TestClient, captured_pushes: list[dict[str, object]]
) -> None:
    owner_h, _partner_h, biz, book = _setup_two_member_biz(client)
    entry = client.post(
        f"/v1/businesses/{biz['id']}/books/{book['id']}/entries",
        json={"type": "in", "amount_cents": 1000, "occurred_at": "2025-03-01T10:00:00Z"},
        headers=owner_h,
    ).json()
    captured_pushes.clear()

    payload = io.BytesIO(b"receipt-bytes")
    up = client.post(
        f"/v1/businesses/{biz['id']}/books/{book['id']}/entries/{entry['id']}/attachments",
        files={"file": ("receipt.txt", payload, "text/plain")},
        headers=owner_h,
    )
    assert up.status_code == 201, up.text

    sends = [p for p in captured_pushes if p["title"] == "New attachment" and p["tokens"]]
    assert len(sends) == 1
    assert sends[0]["tokens"] == ["ExponentPushToken[PARTNER]"]
    assert sends[0]["data"]["type"] == "attachment_uploaded"


def test_role_change_notifies_member(
    client: TestClient, captured_pushes: list[dict[str, object]]
) -> None:
    owner_h, _partner_h, biz, _book = _setup_two_member_biz(client)
    members = client.get(f"/v1/businesses/{biz['id']}/members", headers=owner_h).json()
    partner = next(m for m in members if m["role"] == "partner")
    captured_pushes.clear()

    resp = client.patch(
        f"/v1/businesses/{biz['id']}/members/{partner['id']}",
        json={"role": "staff"},
        headers=owner_h,
    )
    assert resp.status_code == 200, resp.text
    sends = [p for p in captured_pushes if p["title"].startswith("Role updated")]
    assert len(sends) == 1
    assert sends[0]["tokens"] == ["ExponentPushToken[PARTNER]"]
    assert sends[0]["data"]["role"] == "staff"

    # Re-applying the same role should not produce a duplicate push.
    captured_pushes.clear()
    resp2 = client.patch(
        f"/v1/businesses/{biz['id']}/members/{partner['id']}",
        json={"role": "staff"},
        headers=owner_h,
    )
    assert resp2.status_code == 200, resp2.text
    role_sends = [p for p in captured_pushes if p["title"].startswith("Role updated")]
    assert role_sends == []


def test_member_removal_notifies(
    client: TestClient, captured_pushes: list[dict[str, object]]
) -> None:
    owner_h, _partner_h, biz, _book = _setup_two_member_biz(client)
    members = client.get(f"/v1/businesses/{biz['id']}/members", headers=owner_h).json()
    partner = next(m for m in members if m["role"] == "partner")
    captured_pushes.clear()

    resp = client.delete(f"/v1/businesses/{biz['id']}/members/{partner['id']}", headers=owner_h)
    assert resp.status_code == 200, resp.text
    sends = [p for p in captured_pushes if p["title"].startswith("Removed from")]
    assert len(sends) == 1
    assert sends[0]["tokens"] == ["ExponentPushToken[PARTNER]"]
    assert sends[0]["data"]["type"] == "member_removed"


def test_restore_creates_new_business_with_books_and_entries(client: TestClient) -> None:
    owner_h = _signup(client, "+919000000070")
    biz = client.post(
        "/v1/businesses",
        json={"name": "Source", "currency": "INR"},
        headers=owner_h,
    ).json()
    book = client.post(
        f"/v1/businesses/{biz['id']}/books", json={"name": "Daily"}, headers=owner_h
    ).json()
    e1 = client.post(
        f"/v1/businesses/{biz['id']}/books/{book['id']}/entries",
        json={"type": "in", "amount_cents": 5000, "occurred_at": "2025-03-01T10:00:00Z"},
        headers=owner_h,
    ).json()
    e2 = client.post(
        f"/v1/businesses/{biz['id']}/books/{book['id']}/entries",
        json={"type": "out", "amount_cents": 1500, "occurred_at": "2025-03-02T10:00:00Z"},
        headers=owner_h,
    ).json()
    assert e1 and e2

    snapshot = client.get(f"/v1/businesses/{biz['id']}/backup", headers=owner_h).json()
    assert snapshot["version"] == 1
    assert len(snapshot["books"]) == 1
    assert len(snapshot["entries"]) == 2

    # Restore as a different user.
    other_h = _signup(client, "+919000000071")
    resp = client.post(
        "/v1/restore",
        json={"snapshot": snapshot, "name_override": "Source (restored)"},
        headers=other_h,
    )
    assert resp.status_code == 201, resp.text
    new_biz = resp.json()
    assert new_biz["name"] == "Source (restored)"
    assert new_biz["id"] != biz["id"]
    assert new_biz["role"] == "owner"

    # The restored business should hold the same number of entries.
    new_books = client.get(f"/v1/businesses/{new_biz['id']}/books", headers=other_h).json()
    assert len(new_books) == 1
    new_entries = client.get(
        f"/v1/businesses/{new_biz['id']}/books/{new_books[0]['id']}/entries",
        headers=other_h,
    ).json()
    assert len(new_entries["items"]) == 2
    assert new_entries["in_total_cents"] == 5000
    assert new_entries["out_total_cents"] == 1500
    types = sorted(e["type"] for e in new_entries["items"])
    assert types == ["in", "out"]


def test_restore_rejects_unsupported_version(client: TestClient) -> None:
    h = _signup(client, "+919000000072")
    resp = client.post(
        "/v1/restore",
        json={"snapshot": {"version": 99, "business": {"name": "x"}}},
        headers=h,
    )
    assert resp.status_code == 400


def test_restore_requires_business_name(client: TestClient) -> None:
    h = _signup(client, "+919000000073")
    resp = client.post("/v1/restore", json={"snapshot": {"version": 1, "business": {}}}, headers=h)
    assert resp.status_code == 400
