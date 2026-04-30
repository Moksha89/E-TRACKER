from fastapi.testclient import TestClient


def _signup_and_login(client: TestClient, phone: str = "+919000000001") -> str:
    otp_resp = client.post(
        "/v1/auth/otp/request",
        json={"phone": phone, "purpose": "signup"},
    )
    assert otp_resp.status_code == 200, otp_resp.text
    code = otp_resp.json()["debug_code"]
    assert code

    signup_resp = client.post(
        "/v1/auth/signup",
        json={"phone": phone, "password": "secret123", "name": "Tester", "otp": code},
    )
    assert signup_resp.status_code == 200, signup_resp.text
    return signup_resp.json()["access_token"]


def test_full_flow(client: TestClient) -> None:
    token = _signup_and_login(client)
    auth = {"Authorization": f"Bearer {token}"}

    me = client.get("/v1/me", headers=auth)
    assert me.status_code == 200
    assert me.json()["phone_verified"] is True

    biz = client.post("/v1/businesses", json={"name": "Acme"}, headers=auth)
    assert biz.status_code == 201, biz.text
    business_id = biz.json()["id"]
    assert biz.json()["role"] == "owner"

    cats = client.get(f"/v1/businesses/{business_id}/categories", headers=auth).json()
    assert any(c["name"] == "Sales" for c in cats)
    pms = client.get(f"/v1/businesses/{business_id}/payment-modes", headers=auth).json()
    assert any(p["name"] == "Cash" for p in pms)

    book = client.post(
        f"/v1/businesses/{business_id}/books",
        json={"name": "Daily Cash"},
        headers=auth,
    )
    assert book.status_code == 201, book.text
    book_id = book.json()["id"]

    e1 = client.post(
        f"/v1/businesses/{business_id}/books/{book_id}/entries",
        json={
            "type": "in",
            "amount_cents": 5000,
            "occurred_at": "2025-01-01T10:00:00Z",
            "description": "Sale 1",
        },
        headers=auth,
    )
    assert e1.status_code == 201, e1.text

    e2 = client.post(
        f"/v1/businesses/{business_id}/books/{book_id}/entries",
        json={
            "type": "out",
            "amount_cents": 1500,
            "occurred_at": "2025-01-02T10:00:00Z",
            "description": "Rent",
        },
        headers=auth,
    )
    assert e2.status_code == 201

    listing = client.get(
        f"/v1/businesses/{business_id}/books/{book_id}/entries", headers=auth
    ).json()
    assert listing["in_total_cents"] == 5000
    assert listing["out_total_cents"] == 1500
    assert listing["net_balance_cents"] == 3500
    assert len(listing["items"]) == 2

    detail = client.get(f"/v1/businesses/{business_id}/books/{book_id}", headers=auth).json()
    assert detail["net_balance_cents"] == 3500
    assert detail["entry_count"] == 2


def test_invalid_login(client: TestClient) -> None:
    _signup_and_login(client, phone="+919000000002")
    bad = client.post(
        "/v1/auth/login",
        json={"phone": "+919000000002", "password": "wrong"},
    )
    assert bad.status_code == 401
