from datetime import UTC, datetime

from fastapi.testclient import TestClient


def _signup(client: TestClient, phone: str = "+919000099001") -> tuple[str, str]:
    r = client.post(
        "/v1/auth/signup",
        json={"phone": phone, "pin": "123456", "name": "WS Tester"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()["user"]["id"]


def test_ws_pushes_entry_created_event(client: TestClient) -> None:
    token, _user_id = _signup(client)
    headers = {"Authorization": f"Bearer {token}"}

    biz = client.post("/v1/businesses", json={"name": "WS Co"}, headers=headers).json()
    biz_id = biz["id"]
    book = client.post(
        f"/v1/businesses/{biz_id}/books", json={"name": "Main"}, headers=headers
    ).json()
    book_id = book["id"]

    with client.websocket_connect(f"/v1/ws?token={token}&business_id={biz_id}") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        assert hello["business_id"] == biz_id

        r = client.post(
            f"/v1/businesses/{biz_id}/books/{book_id}/entries",
            headers=headers,
            json={
                "type": "in",
                "amount_cents": 12345,
                "occurred_at": datetime.now(UTC).isoformat(),
            },
        )
        assert r.status_code == 201

        evt = ws.receive_json()
        assert evt["type"] == "entry.created"
        assert evt["business_id"] == biz_id
        assert evt["data"]["book_id"] == book_id
        assert evt["data"]["entry"]["amount_cents"] == 12345


def test_ws_rejects_bad_token(client: TestClient) -> None:
    token, _ = _signup(client)
    headers = {"Authorization": f"Bearer {token}"}
    biz = client.post("/v1/businesses", json={"name": "WS Co"}, headers=headers).json()

    import websockets.exceptions  # noqa: F401  (used in except)
    from starlette.websockets import WebSocketDisconnect

    try:
        with client.websocket_connect(f"/v1/ws?token=garbage&business_id={biz['id']}"):
            raise AssertionError("connection should have been rejected")
    except WebSocketDisconnect as exc:
        assert exc.code == 1008
