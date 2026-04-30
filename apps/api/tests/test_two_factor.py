from fastapi.testclient import TestClient


def _signup(client: TestClient, phone: str = "+919000088001") -> tuple[str, str]:
    otp = client.post("/v1/auth/otp/request", json={"phone": phone, "purpose": "signup"}).json()
    code = otp["debug_code"]
    r = client.post(
        "/v1/auth/signup",
        json={
            "phone": phone,
            "password": "secretpass123",
            "name": "TFA Tester",
            "otp": code,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"], phone


def _request_sensitive_otp(client: TestClient, phone: str) -> str:
    resp = client.post("/v1/auth/otp/request", json={"phone": phone, "purpose": "sensitive"})
    assert resp.status_code == 200, resp.text
    code = resp.json()["debug_code"]
    assert code
    return str(code)


def test_two_factor_toggle_round_trip(client: TestClient) -> None:
    token, phone = _signup(client)
    headers = {"Authorization": f"Bearer {token}"}

    status = client.get("/v1/me/2fa", headers=headers).json()
    assert status == {"enabled": False}

    code = _request_sensitive_otp(client, phone)
    r = client.post("/v1/me/2fa", headers=headers, json={"enabled": True, "otp": code})
    assert r.status_code == 200, r.text
    assert r.json() == {"enabled": True}

    me = client.get("/v1/me", headers=headers).json()
    assert me["two_factor_enabled"] is True

    code = _request_sensitive_otp(client, phone)
    r = client.post("/v1/me/2fa", headers=headers, json={"enabled": False, "otp": code})
    assert r.status_code == 200
    assert r.json() == {"enabled": False}


def test_password_change_requires_otp_when_2fa_on(client: TestClient) -> None:
    token, phone = _signup(client)
    headers = {"Authorization": f"Bearer {token}"}

    code = _request_sensitive_otp(client, phone)
    client.post("/v1/me/2fa", headers=headers, json={"enabled": True, "otp": code})

    r = client.post(
        "/v1/me/password",
        headers=headers,
        json={"current_password": "secretpass123", "new_password": "newpass99887"},
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "otp_required"

    code = _request_sensitive_otp(client, phone)
    r = client.post(
        "/v1/me/password",
        headers=headers,
        json={
            "current_password": "secretpass123",
            "new_password": "newpass99887",
            "otp": code,
        },
    )
    assert r.status_code == 204


def test_business_delete_requires_otp_when_2fa_on(client: TestClient) -> None:
    token, phone = _signup(client)
    headers = {"Authorization": f"Bearer {token}"}
    biz = client.post("/v1/businesses", headers=headers, json={"name": "TFA Co"}).json()

    code = _request_sensitive_otp(client, phone)
    client.post("/v1/me/2fa", headers=headers, json={"enabled": True, "otp": code})

    r = client.delete(f"/v1/businesses/{biz['id']}", headers=headers)
    assert r.status_code == 401
    assert r.json()["detail"] == "otp_required"

    code = _request_sensitive_otp(client, phone)
    r = client.delete(f"/v1/businesses/{biz['id']}?otp={code}", headers=headers)
    assert r.status_code == 204
