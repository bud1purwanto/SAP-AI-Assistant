"""Autentikasi, hashing password, dan kontrol akses antar user."""
import pytest
from sqlalchemy import text

from conftest import ADMIN_PASSWORD, ADMIN_USER


def test_wrong_password_rejected(client):
    res = client.post("/api/login", json={"username": ADMIN_USER, "password": "salah"})
    assert res.status_code == 401


def test_legacy_hardcoded_credentials_removed(client):
    """Kredensial fallback lama menerima login kapan pun database bermasalah."""
    for username, password in [("TRSTDEV", "ronin03"), ("TRST-BUDI", "1234567")]:
        assert client.post("/api/login", json={"username": username, "password": password}).status_code == 401


def test_login_returns_jwt(client):
    res = client.post("/api/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    body = res.json()
    assert res.status_code == 200
    assert body["access_token"] and body["role"] == "superadmin"


def test_password_stored_as_bcrypt_hash(db):
    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT password, password_hash FROM ai_assistant.users WHERE username = :u"),
            {"u": ADMIN_USER},
        ).fetchone()
    assert row.password_hash.startswith("$2b$")
    assert not row.password


def test_user_name_header_no_longer_authenticates(client):
    """Identitas dulu diambil dari header yang dapat dipalsukan siapa pun."""
    res = client.get("/api/admin/users", headers={"X-User-Name": ADMIN_USER})
    assert res.status_code == 401


def test_forged_token_rejected(client):
    res = client.get("/api/sessions", headers={"Authorization": "Bearer bukan.token.valid"})
    assert res.status_code == 401


def test_non_admin_blocked_from_admin_api(client, make_user):
    auth = make_user("alice")
    assert client.get("/api/admin/users", headers=auth).status_code == 403


def test_password_change_invalidates_old_password(client, make_user):
    auth = make_user("bob")
    res = client.post(
        "/api/change-password",
        json={"old_password": "Passw0rd123", "new_password": "PasswordBaru1"},
        headers=auth,
    )
    assert res.status_code == 200, res.text
    assert client.post("/api/login", json={"username": "bob", "password": "Passw0rd123"}).status_code == 401
    assert client.post("/api/login", json={"username": "bob", "password": "PasswordBaru1"}).status_code == 200


@pytest.mark.parametrize("password", ["123", "pendek"])
def test_weak_password_rejected(client, admin_auth, password):
    res = client.post(
        "/api/admin/users",
        json={"username": "lemah", "password": password, "role": "user"},
        headers=admin_auth,
    )
    assert res.status_code == 400


def test_admin_cannot_delete_own_account(client, admin_auth):
    assert client.delete(f"/api/admin/users/{ADMIN_USER}", headers=admin_auth).status_code == 400


def test_login_throttled_after_repeated_failures(client, make_user):
    make_user("target")
    codes = [
        client.post("/api/login", json={"username": "target", "password": "salah"}).status_code
        for _ in range(12)
    ]
    assert 429 in codes, "percobaan login gagal tidak pernah dibatasi"
    # Password yang benar pun ditolak selama masa penguncian.
    assert client.post("/api/login", json={"username": "target", "password": "Passw0rd123"}).status_code == 429
