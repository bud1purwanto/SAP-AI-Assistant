"""Autentikasi OIDC BFF dan migrasi identitas subjek."""
import pytest
from sqlalchemy import text
from migrations import run_identity_migration


def seed_legacy_user(db, username="alice"):
    with db.get_engine().connect() as conn:
        conn.execute(
            text("INSERT INTO ai_assistant_dev.users (username, role) VALUES (:u, 'user') ON CONFLICT (username) DO NOTHING"),
            {"u": username},
        )
        conn.commit()


def seed_chat_session(db, username="alice"):
    with db.get_engine().connect() as conn:
        conn.execute(
            text("INSERT INTO ai_assistant_dev.chat_sessions (session_id, username, title) VALUES (:s, :u, 'Test Session') ON CONFLICT (session_id) DO NOTHING"),
            {"s": f"test_session_{username}", "u": username},
        )
        conn.commit()


def get_chat_session_owner(db):
    with db.get_engine().connect() as conn:
        row = conn.execute(text("SELECT username FROM ai_assistant_dev.chat_sessions LIMIT 1")).fetchone()
        return row[0] if row else None


def test_login_redirects_to_dashboard_oidc(client):
    r = client.get("/api/auth/login", follow_redirects=False)
    assert r.status_code in (302, 307)
    assert "client_id=sap-ai-assistant" in r.headers["location"]
    assert "code_challenge=" in r.headers["location"]


def test_local_password_login_removed(client):
    r = client.post("/api/login", json={"username": "TRSTDEV", "password": "ChangeMe!2024"})
    assert r.status_code == 404


def test_username_to_sub_migration_rewrites_owned_rows(db):
    seed_legacy_user(db, username="alice")
    seed_chat_session(db, username="alice")
    run_identity_migration(db, {"alice": "dashboard-sub-1"})
    assert get_chat_session_owner(db) == "dashboard-sub-1"


def test_identity_migration_fails_on_unmapped_user(db):
    seed_legacy_user(db, username="alice")
    with pytest.raises(RuntimeError, match="unmapped"):
        run_identity_migration(db, {})


def test_user_name_header_no_longer_authenticates(client):
    """Identitas tidak boleh diambil dari header yang dapat dipalsukan."""
    res = client.get("/api/admin/users", headers={"X-User-Name": "TRSTDEV"})
    assert res.status_code == 401


def test_forged_session_cookie_rejected(client):
    """Cookie sesi palsu / rusak harus ditolak."""
    res = client.get("/api/sessions", headers={"Cookie": "sap_session=bukan.token.valid"})
    assert res.status_code == 401


def test_auth_session_returns_profile_without_tokens(client, make_user):
    """Endpoint /api/auth/session atau /api/auth/me mengembalikan profil tanpa bearer/refresh tokens."""
    auth = make_user("user_session_test")
    res = client.get("/api/auth/session", headers=auth)
    assert res.status_code == 200
    data = res.json()
    assert "sub" in data
    assert "username" in data
    assert "access_token" not in data
    assert "refresh_token" not in data
    assert "token" not in data


def test_auth_logout_clears_cookie(client, make_user):
    """Endpoint /api/auth/logout menghapus cookie sesi."""
    auth = make_user("user_logout_test")
    res = client.post("/api/auth/logout", headers=auth)
    assert res.status_code == 200
    # Cek response sets deletion cookie (Max-Age=0 or empty value)
    assert "sap_session" in res.headers.get("set-cookie", "")
