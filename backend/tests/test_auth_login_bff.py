import asyncio
import json
import jwt
import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from unittest.mock import patch

from main import app, _map_dashboard_user
from config import settings


@pytest.fixture
def client():
    return TestClient(app)


DASH_USER_OK = {
    "id": "u-123",
    "username": "alice",
    "email": "alice@example.com",
    "role": "admin",
    "rawRole": "ADMIN",
    "isActive": True,
    "departments": [{"id": "d1", "name": "Engineering"}],
    "divisions": [{"id": "dv1", "name": "Platform", "code": "PLAT"}],
    "positions": [{"id": "p1", "name": "Senior Eng", "jobLevel": 5, "divisionId": "dv1"}],
}


@respx.mock
def test_login_success_sets_cookie_and_returns_principal(client):
    route = respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        return_value=httpx.Response(
            200, json={"accessToken": "tok-abc", "expiresIn": 3600, "user": DASH_USER_OK}
        )
    )
    r = client.post("/api/auth/login", json={"username": "alice", "password": "pw"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["access_token"] == "tok-abc"
    assert body["user"]["username"] == "alice"
    assert body["user"]["role"] == "admin"
    assert body["user"]["org_units"] == ["Engineering"]
    assert body["user"]["division_code"] == "PLAT"
    assert body["user"]["department_name"] == "Engineering"
    assert body["user"]["force_change_password"] is False
    assert "sap_session" in r.cookies
    assert route.called


def test_first_oidc_login_creates_local_user_before_session():
    import main
    from starlette.requests import Request
    from starlette.responses import Response

    real_async_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, json={"accessToken": "tok-new", "user": DASH_USER_OK}
    ))
    events = []

    def ensure(**kwargs):
        events.append("user")
        return {"username": kwargs["username"].upper()}

    def create_session(**kwargs):
        events.append("session")
        assert kwargs["username"] == "ALICE"
        return {"id": kwargs["session_id"]}

    with patch("main.httpx.AsyncClient", side_effect=lambda **kwargs: real_async_client(transport=transport)), \
         patch("main.ensure_user_exists", side_effect=ensure), \
         patch("main.invalidate_existing_user_sessions", return_value=[]), \
         patch("main.create_user_session", side_effect=create_session), \
         patch("main.record_auth_audit_log"), \
         patch("main.create_session_cookie", return_value="signed-session"):
        response = Response()
        result = asyncio.run(main.auth_login(
            main.LoginRequest(username="alice", password="pw"),
            Request({"type": "http", "method": "POST", "path": "/api/auth/login", "headers": []}),
            response,
        ))

    assert result["status"] == "success"
    assert result["user"]["username"] == "ALICE"
    assert events == ["user", "session"]


def test_login_stops_if_local_user_cannot_be_created():
    import main
    from fastapi import HTTPException
    from starlette.requests import Request
    from starlette.responses import Response

    real_async_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, json={"accessToken": "tok-new", "user": DASH_USER_OK}
    ))
    with patch("main.httpx.AsyncClient", side_effect=lambda **kwargs: real_async_client(transport=transport)), \
         patch("main.ensure_user_exists", return_value=None), \
         patch("main.create_user_session") as create_session:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(main.auth_login(
                main.LoginRequest(username="alice", password="pw"),
                Request({"type": "http", "method": "POST", "path": "/api/auth/login", "headers": []}),
                Response(),
            ))

    assert exc.value.status_code == 503
    create_session.assert_not_called()


@respx.mock
def test_login_wrong_password_returns_401_no_cookie(client):
    respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        return_value=httpx.Response(401, json={"message": "invalid credentials"})
    )
    r = client.post("/api/auth/login", json={"username": "alice", "password": "bad"})
    assert r.status_code == 401
    assert "sap_session" not in r.cookies


@respx.mock
def test_login_dashboard_unreachable_returns_502(client):
    respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        side_effect=httpx.ConnectError("down")
    )
    r = client.post("/api/auth/login", json={"username": "alice", "password": "pw"})
    assert r.status_code == 502


def test_empty_credentials_rejected_before_http_call(client):
    r = client.post("/api/auth/login", json={"username": "", "password": ""})
    assert r.status_code == 400


def test_mapper_handles_missing_departments_divisions_positions():
    p = _map_dashboard_user({"id": "x", "username": "bob", "role": "viewer"}, "tok")
    assert p["org_units"] == []
    assert p["division_code"] is None
    assert p["division_name"] is None
    assert p["job_level"] == ""
    assert p["department_name"] is None
    assert p["roles"] == ["viewer"]
    assert p["force_change_password"] is False


@respx.mock
def test_logout_clears_cookie_even_when_upstream_fails(client):
    # Establish session first.
    respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        return_value=httpx.Response(200, json={"accessToken": "t", "expiresIn": 60, "user": DASH_USER_OK})
    )
    client.post("/api/auth/login", json={"username": "alice", "password": "pw"})

    upstream = respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/logout").mock(
        side_effect=httpx.ConnectError("down")
    )
    r = client.post("/api/auth/logout")
    assert r.status_code in (200, 204)
    assert upstream.called
    # Cookie cleared: Set-Cookie header with empty/max-age=0.
    set_cookie = r.headers.get("set-cookie", "")
    assert "sap_session=" in set_cookie and ("Max-Age=0" in set_cookie or "Expires=" in set_cookie)

@respx.mock
def test_change_oidc_password_uses_temporary_token_without_app_cookie(client):
    forced_user = {**DASH_USER_OK, "mustChangePassword": True}
    respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        return_value=httpx.Response(200, json={"accessToken": "temporary-token", "user": forced_user})
    )
    change = respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/change-password").mock(
        return_value=httpx.Response(204)
    )
    r = client.post("/api/auth/change-password", json={
        "username": "alice", "current_password": "temporary", "new_password": "NewPass123!"
    })
    assert r.status_code == 200
    assert "sap_session" not in r.cookies
    assert change.called
    assert change.calls[0].request.headers["authorization"] == "Bearer temporary-token"
    assert json.loads(change.calls[0].request.content) == {"currentPassword": "temporary", "newPassword": "NewPass123!"}


@respx.mock
def test_change_oidc_password_rejects_wrong_temporary_password(client):
    respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/login").mock(
        return_value=httpx.Response(401, json={"message": "invalid credentials"})
    )
    change = respx.post(f"{settings.dashboard_oidc_issuer.rstrip('/')}/v1/auth/change-password").mock(
        return_value=httpx.Response(204)
    )
    r = client.post("/api/auth/change-password", json={
        "username": "alice", "current_password": "wrong", "new_password": "NewPass123!"
    })
    assert r.status_code == 401
    assert not change.called


def _login_with_existing_sessions(existing_sessions, cookie_header=None):
    import main
    from starlette.requests import Request
    from starlette.responses import Response

    real_async_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(
        200, json={"accessToken": "tok-new", "expiresIn": 900, "user": DASH_USER_OK}
    ))
    headers = [(b"user-agent", b"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36")]
    if cookie_header:
        headers.append((b"cookie", cookie_header.encode()))
    request = Request({"type": "http", "method": "POST", "path": "/api/auth/login",
                       "headers": headers, "client": ("127.0.0.1", 5000)})
    with patch("main.httpx.AsyncClient", side_effect=lambda **kwargs: real_async_client(transport=transport)), \
         patch("main.ensure_user_exists", return_value={"username": "alice"}), \
         patch("main.get_active_sessions_by_username", return_value=existing_sessions), \
         patch("database.deactivate_sessions_by_ids") as deactivate, \
         patch("main.create_user_session"), \
         patch("main.record_auth_audit_log"), \
         patch("main.create_session_cookie", return_value="signed-session"):
        asyncio.run(main.auth_login(main.LoginRequest(username="alice", password="pw"), request, Response()))
    return deactivate


def test_login_does_not_kick_other_device_with_same_browser_and_os():
    """PC lain dengan Chrome/Windows di balik IP yang sama tidak boleh ikut diputus."""
    other_pc = {"id": "sess-other-pc", "browser": "Chrome", "os": "Windows",
                "ip_address": "127.0.0.1", "device_name": "PC (Chrome - Windows)"}
    deactivate = _login_with_existing_sessions([other_pc])
    deactivate.assert_not_called()


def test_login_replaces_only_the_session_of_this_browser():
    import auth
    old_cookie = jwt.encode({"sub": "u-123", "username": "alice", "roles": ["admin"], "session_id": "sess-this-browser"},
                            settings.session_secret, algorithm="HS256")
    sessions = [
        {"id": "sess-this-browser", "browser": "Chrome", "os": "Windows", "ip_address": "127.0.0.1"},
        {"id": "sess-other-pc", "browser": "Chrome", "os": "Windows", "ip_address": "127.0.0.1"},
    ]
    deactivate = _login_with_existing_sessions(sessions, f"{settings.session_cookie_name}={old_cookie}")
    deactivate.assert_called_once()
    assert deactivate.call_args.args[0] == ["sess-this-browser"]
