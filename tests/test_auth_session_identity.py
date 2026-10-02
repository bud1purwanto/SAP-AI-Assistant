"""A profile refresh must preserve the login session used for MCP authorization."""

import jwt
import pytest
from fastapi.testclient import TestClient

import auth
import main
from config import settings


@pytest.mark.parametrize("path", ["/api/auth/session", "/api/me"])
def test_profile_refresh_reuses_authenticated_session(monkeypatch, path):
    monkeypatch.setattr(auth, "_resolve_dashboard_token", lambda session_id: "dashboard-token" if session_id == "login-session" else None)
    monkeypatch.setattr(main, "get_user_by_username", lambda username: {"full_name": "Test User"})
    monkeypatch.setattr(
        main,
        "create_user_session",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("profile refresh created a duplicate session")),
    )
    cookie = jwt.encode(
        {"sub": "user-1", "username": "test-user", "role": "user", "session_id": "login-session"},
        settings.session_secret,
        algorithm="HS256",
    )
    with TestClient(main.app) as client:
        client.cookies.set(settings.session_cookie_name, cookie)
        response = client.get(path)

    assert response.status_code == 200
    assert response.json()["session_id"] == "login-session"


def test_dashboard_token_uses_application_clock_when_database_clock_is_ahead(monkeypatch):
    """A five-minute login remains readable despite a ten-minute DB clock skew."""
    from datetime import datetime, timedelta, timezone
    import database

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    database_clock = datetime.now(timezone.utc) + timedelta(minutes=10)

    class Result:
        def __init__(self, value):
            self.value = value

        def scalar(self):
            return self.value

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def execute(self, statement, params):
            assert database_clock > expires_at
            assert ':now' in str(statement)
            return Result('encrypted-token' if params['now'] < expires_at else None)

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(database, 'get_engine', lambda: Engine())
    monkeypatch.setattr(database, 'decrypt_fernet', lambda value: 'dashboard-token' if value == 'encrypted-token' else None)

    assert database.get_dashboard_session_token('login-session') == 'dashboard-token'
