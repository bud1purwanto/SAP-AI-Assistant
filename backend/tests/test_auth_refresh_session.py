"""Refresh browser harus memulihkan identitas dari sesi BFF yang masih sah."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from starlette.requests import Request

import auth


def _request_with_session(payload):
    cookie = jwt.encode(payload, auth.settings.session_secret, algorithm="HS256")
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/api/auth/session",
        "headers": [(b"cookie", f"{auth.settings.session_cookie_name}={cookie}".encode())],
    })


def test_refresh_keeps_oidc_identity_when_access_token_is_unavailable(monkeypatch):
    monkeypatch.setattr(auth, "_resolve_dashboard_token", lambda _session_id: None)
    monkeypatch.setattr("database.get_user_session", lambda _session_id: {"is_active": True})
    request = _request_with_session({
        "sub": "oidc-user-123",
        "username": "alice",
        "role": "admin",
        "roles": ["admin"],
        "department_name": "Engineering",
        "session_id": "session-123",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    })

    principal = auth.get_current_principal(request)
    optional = auth.get_current_user_optional(request)

    assert principal["sub"] == optional["sub"] == "oidc-user-123"
    assert principal["department_name"] == "Engineering"
    assert principal["dashboard_token"] is None
    assert auth.get_dashboard_access_token() is None


def test_refresh_rejects_revoked_session(monkeypatch):
    monkeypatch.setattr(auth, "_resolve_dashboard_token", lambda _session_id: None)
    monkeypatch.setattr("database.get_user_session", lambda _session_id: {"is_active": False})
    request = _request_with_session({
        "sub": "oidc-user-123", "username": "alice", "role": "admin",
        "roles": ["admin"], "session_id": "revoked-session",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    })

    with pytest.raises(HTTPException) as exc:
        auth.get_current_principal(request)
    assert exc.value.status_code == 401


def test_session_cookie_does_not_expose_oidc_refresh_token(monkeypatch):
    monkeypatch.setattr("database.save_dashboard_session_token", lambda *args, **kwargs: True)
    encoded = auth.create_session_cookie({
        "sub": "oidc-user-123",
        "username": "alice",
        "role": "admin",
        "roles": ["admin"],
        "session_id": "session-123",
        "access_token": "access-secret",
        "refresh_token": "refresh-secret",
    })

    payload = auth.decode_session_cookie(encoded)
    assert "access_token" not in payload
    assert "refresh_token" not in payload
