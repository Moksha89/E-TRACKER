from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.push as push_mod
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

    # Patch the import-bound reference everywhere it's used.
    monkeypatch.setattr(push_mod, "send_to_tokens", fake_send)
    monkeypatch.setattr(entries_mod, "notify_business_members", push_mod.notify_business_members)
    monkeypatch.setattr(members_mod, "notify_user", push_mod.notify_user)
    return sent


def test_entry_creation_pushes_to_other_members(
    client: TestClient, captured_pushes: list[dict[str, object]]
) -> None:
    owner_h = _signup(client, "+919000000050")
    biz = client.post("/v1/businesses", json={"name": "Acme"}, headers=owner_h).json()
    book = client.post(
        f"/v1/businesses/{biz['id']}/books", json={"name": "Daily"}, headers=owner_h
    ).json()

    # Invite a partner.
    partner_phone = "+919000000051"
    invite = client.post(
        f"/v1/businesses/{biz['id']}/members",
        json={"phone": partner_phone, "role": "partner"},
        headers=owner_h,
    )
    assert invite.status_code == 201, invite.text
    # Expect a push for the invite (no devices yet, so tokens=[]; still recorded).
    assert any(p["title"].startswith("Invited to") for p in captured_pushes)

    # Partner claims account: request OTP for password reset, then reset.
    partner_otp = client.post(
        "/v1/auth/otp/request",
        json={"phone": partner_phone, "purpose": "reset_password"},
    ).json()["debug_code"]
    reset = client.post(
        "/v1/auth/password/reset",
        json={"phone": partner_phone, "otp": partner_otp, "new_password": "secret123"},
    )
    assert reset.status_code == 200, reset.text
    partner_h = {"Authorization": f"Bearer {reset.json()['access_token']}"}
    accept = client.post(f"/v1/businesses/{biz['id']}/members/accept", headers=partner_h)
    assert accept.status_code == 200, accept.text

    # Both register an Expo push token.
    client.post(
        "/v1/me/devices",
        json={"expo_push_token": "ExponentPushToken[OWNER1]", "platform": "ios"},
        headers=owner_h,
    )
    client.post(
        "/v1/me/devices",
        json={"expo_push_token": "ExponentPushToken[PARTNER1]", "platform": "android"},
        headers=partner_h,
    )

    captured_pushes.clear()

    # Owner creates an entry — partner should receive a push, owner should not.
    entry = client.post(
        f"/v1/businesses/{biz['id']}/books/{book['id']}/entries",
        json={"type": "in", "amount_cents": 5000, "occurred_at": "2025-02-01T10:00:00Z"},
        headers=owner_h,
    )
    assert entry.status_code == 201, entry.text

    sends = [p for p in captured_pushes if p["title"].startswith("Daily:")]
    assert len(sends) == 1
    tokens = sends[0]["tokens"]
    assert tokens == ["ExponentPushToken[PARTNER1]"]
    assert "received" in sends[0]["title"]
    assert sends[0]["data"]["type"] == "entry_created"


def test_entry_creation_no_other_members_no_push(
    client: TestClient, captured_pushes: list[dict[str, object]]
) -> None:
    owner_h = _signup(client, "+919000000052")
    biz = client.post("/v1/businesses", json={"name": "Solo"}, headers=owner_h).json()
    book = client.post(
        f"/v1/businesses/{biz['id']}/books", json={"name": "Daily"}, headers=owner_h
    ).json()
    client.post(
        "/v1/me/devices",
        json={"expo_push_token": "ExponentPushToken[SOLO1]"},
        headers=owner_h,
    )
    captured_pushes.clear()
    entry = client.post(
        f"/v1/businesses/{biz['id']}/books/{book['id']}/entries",
        json={"type": "out", "amount_cents": 200, "occurred_at": "2025-02-02T10:00:00Z"},
        headers=owner_h,
    )
    assert entry.status_code == 201, entry.text
    # The push job runs but resolves to zero tokens (only member is the actor).
    sends = [p for p in captured_pushes if p["title"].startswith("Daily:") and p["tokens"]]
    assert sends == []


def test_send_to_tokens_dry_run_no_http(monkeypatch: pytest.MonkeyPatch) -> None:
    """The push module's dry-run path must not attempt any HTTP call."""
    monkeypatch.setenv("EXPO_PUSH_DRY_RUN", "1")

    def boom(*_args: object, **_kwargs: object) -> None:  # pragma: no cover
        raise AssertionError("HTTP must not be called in dry-run")

    monkeypatch.setattr(push_mod.httpx, "Client", boom)
    push_mod.send_to_tokens(["ExponentPushToken[X]"], "t", "b", {"k": "v"})
