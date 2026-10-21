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


def test_resigning_cookie_does_not_extend_oidc_token_expiry(monkeypatch):
    """Heartbeat menandatangani ulang cookie tanpa oidc_expires_in; masa berlaku
    token OIDC yang tersimpan tidak boleh ikut diperpanjang, agar auto-refresh
    tetap berjalan sebelum token kedaluwarsa di sisi OIDC."""
    saved = []
    monkeypatch.setattr("database.save_dashboard_session_token", lambda *a, **kw: saved.append((a, kw)) or True)
    real_exp = datetime.now(timezone.utc) + timedelta(seconds=30)
    monkeypatch.setitem(auth._dashboard_tokens, "session-hb", ("access-secret", real_exp, "refresh-secret"))

    encoded = auth.create_session_cookie({
        "sub": "oidc-user-123",
        "username": "alice",
        "role": "admin",
        "roles": ["admin"],
        "session_id": "session-hb",
        "access_token": "access-secret",
        "dashboard_token": "access-secret",
        "refresh_token": "refresh-secret",
    })

    assert saved == []
    assert auth._dashboard_tokens["session-hb"][1] == real_exp
    payload = auth.decode_session_cookie(encoded)
    assert payload["session_id"] == "session-hb"
    assert "dashboard_token" not in payload


class _NoLock:
    def __init__(self, *_a, **_kw):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False


def test_stale_worker_cache_uses_token_refreshed_by_another_worker(monkeypatch):
    """Central Dashboard merotasi refresh token (sekali pakai). Worker dengan cache basi
    harus memakai token yang sudah di-refresh worker lain, bukan me-refresh dengan token yang dicabut."""
    now = datetime.now(timezone.utc)
    monkeypatch.setitem(auth._dashboard_tokens, "sess-multi", ("old-access", now - timedelta(minutes=1), "revoked-refresh"))
    monkeypatch.setattr("database.get_dashboard_session_data", lambda _sid: {
        "access_token": "new-access", "refresh_token": "new-refresh", "exp": now + timedelta(minutes=14),
    })
    monkeypatch.setattr("database.dashboard_refresh_lock", _NoLock)
    calls = []
    monkeypatch.setattr(auth, "_try_refresh_dashboard_token", lambda sid, rt: calls.append(rt) or "x")

    assert auth._resolve_dashboard_token("sess-multi") == "new-access"
    assert calls == []
    assert auth._dashboard_tokens["sess-multi"][2] == "new-refresh"


def test_refresh_uses_latest_refresh_token_from_database(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setitem(auth._dashboard_tokens, "sess-exp", ("old-access", now - timedelta(minutes=1), "revoked-refresh"))
    monkeypatch.setattr("database.get_dashboard_session_data", lambda _sid: {
        "access_token": "old-access-2", "refresh_token": "latest-refresh", "exp": now - timedelta(seconds=5),
    })
    monkeypatch.setattr("database.dashboard_refresh_lock", _NoLock)
    calls = []
    monkeypatch.setattr(auth, "_try_refresh_dashboard_token", lambda sid, rt: calls.append(rt) or "fresh-access")

    assert auth._resolve_dashboard_token("sess-exp") == "fresh-access"
    assert calls == ["latest-refresh"]


def test_forced_refresh_after_rejection_does_not_reuse_rejected_token(monkeypatch):
    now = datetime.now(timezone.utc)
    monkeypatch.setattr("database.get_dashboard_session_data", lambda _sid: {
        "access_token": "rejected-access", "refresh_token": "rt-1", "exp": now + timedelta(minutes=10),
    })
    monkeypatch.setattr("database.dashboard_refresh_lock", _NoLock)
    calls = []
    monkeypatch.setattr(auth, "_try_refresh_dashboard_token", lambda sid, rt: calls.append(rt) or "fresh-access")

    assert auth.refresh_dashboard_session("sess-401", rejected_token="rejected-access") == "fresh-access"
    assert calls == ["rt-1"]
