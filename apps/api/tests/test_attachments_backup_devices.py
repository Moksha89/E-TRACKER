from __future__ import annotations

import io

from fastapi.testclient import TestClient


def _signup(client: TestClient, phone: str) -> str:
    otp = client.post("/v1/auth/otp/request", json={"phone": phone, "purpose": "signup"}).json()[
        "debug_code"
    ]
    resp = client.post(
        "/v1/auth/signup",
        json={"phone": phone, "password": "secret123", "name": "User", "otp": otp},
    )
    assert resp.status_code == 200, resp.text
    token: str = resp.json()["access_token"]
    return token


def _bootstrap(client: TestClient) -> tuple[str, str, str, str]:
    token = _signup(client, "+919000000040")
    h = {"Authorization": f"Bearer {token}"}
    biz = client.post("/v1/businesses", json={"name": "Acme"}, headers=h).json()
    book = client.post(
        f"/v1/businesses/{biz['id']}/books",
        json={"name": "Daily"},
        headers=h,
    ).json()
    entry = client.post(
        f"/v1/businesses/{biz['id']}/books/{book['id']}/entries",
        json={"type": "in", "amount_cents": 1000, "occurred_at": "2025-01-01T10:00:00Z"},
        headers=h,
    ).json()
    return token, biz["id"], book["id"], entry["id"]


def test_attachment_upload_list_download_delete(client: TestClient) -> None:
    token, biz_id, book_id, entry_id = _bootstrap(client)
    h = {"Authorization": f"Bearer {token}"}

    payload = io.BytesIO(b"hello world receipt")
    upload = client.post(
        f"/v1/businesses/{biz_id}/books/{book_id}/entries/{entry_id}/attachments",
        files={"file": ("receipt.txt", payload, "text/plain")},
        headers=h,
    )
    assert upload.status_code == 201, upload.text
    obj = upload.json()
    assert obj["original_filename"] == "receipt.txt"
    assert obj["mime_type"] == "text/plain"
    assert obj["size_bytes"] == len(b"hello world receipt")

    listing = client.get(
        f"/v1/businesses/{biz_id}/books/{book_id}/entries/{entry_id}/attachments",
        headers=h,
    ).json()
    assert len(listing) == 1
    assert listing[0]["id"] == obj["id"]

    download = client.get(f"/v1/attachments/{obj['id']}/download", headers=h)
    assert download.status_code == 200
    assert download.content == b"hello world receipt"

    delete = client.delete(
        f"/v1/businesses/{biz_id}/books/{book_id}/entries/{entry_id}/attachments/{obj['id']}",
        headers=h,
    )
    assert delete.status_code == 200
    after = client.get(
        f"/v1/businesses/{biz_id}/books/{book_id}/entries/{entry_id}/attachments",
        headers=h,
    ).json()
    assert after == []


def test_backup_export(client: TestClient) -> None:
    token, biz_id, book_id, entry_id = _bootstrap(client)
    h = {"Authorization": f"Bearer {token}"}

    backup = client.get(f"/v1/businesses/{biz_id}/backup", headers=h)
    assert backup.status_code == 200
    body = backup.json()
    assert body["version"] == 1
    assert body["business"]["id"] == biz_id
    assert any(b["id"] == book_id for b in body["books"])
    assert any(e["id"] == entry_id for e in body["entries"])
    # Default categories + payment modes are seeded.
    assert len(body["categories"]) >= 5
    assert len(body["payment_modes"]) >= 5


def test_device_register_and_remove(client: TestClient) -> None:
    token = _signup(client, "+919000000041")
    h = {"Authorization": f"Bearer {token}"}

    register = client.post(
        "/v1/me/devices",
        json={
            "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
            "platform": "android",
            "locale": "en",
        },
        headers=h,
    )
    assert register.status_code == 200, register.text
    device = register.json()
    assert device["platform"] == "android"

    # Re-registering the same token is idempotent.
    again = client.post(
        "/v1/me/devices",
        json={
            "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
            "platform": "android",
            "locale": "hi",
        },
        headers=h,
    )
    assert again.status_code == 200
    assert again.json()["id"] == device["id"]
    assert again.json()["locale"] == "hi"

    listing = client.get("/v1/me/devices", headers=h).json()
    assert len(listing) == 1

    delete = client.delete(f"/v1/me/devices/{device['id']}", headers=h)
    assert delete.status_code == 200
    assert client.get("/v1/me/devices", headers=h).json() == []
