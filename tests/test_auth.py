"""Pengujian autentikasi standalone, JWT/cookie session, dan manajemen user."""
import pytest
from config import settings
from database import create_new_user, delete_user_by_admin, get_user_by_username


def test_login_successful_with_bootstrap_admin(client):
    """Login berhasil dengan akun bootstrap admin menggunakan password default."""
    r = client.post(
        "/api/auth/login",
        json={"username": "TRSTDEV", "password": settings.bootstrap_admin_password},
    )
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "success"
    assert "access_token" in data
    assert data.get("token_type") == "bearer"
    assert data.get("user", {}).get("username") == "TRSTDEV"
    assert "sap_session" in r.headers.get("set-cookie", "")


def test_login_failed_with_wrong_password(client):
    """Login ditolak dengan status 401 jika password salah."""
    r = client.post(
        "/api/auth/login",
        json={"username": "TRSTDEV", "password": "WrongPassword123!"},
    )
    assert r.status_code == 401


def test_login_failed_with_nonexistent_user(client):
    """Login ditolak dengan status 401 jika username tidak ditemukan."""
    r = client.post(
        "/api/auth/login",
        json={"username": "nonexistent_user_xyz", "password": "SomePassword123!"},
    )
    assert r.status_code == 401


def test_bearer_token_authenticates_protected_endpoint(client):
    """Token JWT Bearer dapat digunakan untuk autentikasi endpoint terlindungi."""
    login_res = client.post(
        "/api/auth/login",
        json={"username": "TRSTDEV", "password": settings.bootstrap_admin_password},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert body["access_token"] and body["role"] == "superadmin"


def test_password_stored_as_bcrypt_hash(db):
    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT password, password_hash FROM ai_assistant_dev.users WHERE username = :u"),
            {"u": ADMIN_USER},
        ).fetchone()
    assert row.password_hash.startswith("$2b$")
    assert not row.password


def test_user_name_header_no_longer_authenticates(client):
    """Identitas dulu diambil dari header yang dapat dipalsukan siapa pun."""
    res = client.get("/api/admin/users", headers={"X-User-Name": ADMIN_USER})
    assert res.status_code == 401


def test_user_name_header_no_longer_authenticates(client):
    """Identitas tidak boleh diambil dari header yang dapat dipalsukan."""
    client.cookies.clear()
    res = client.get("/api/admin/users", headers={"X-User-Name": "TRSTDEV"})
    assert res.status_code == 401

def test_change_password_flow(client, db):
    """Alur pergantian password oleh pengguna mandiri."""
    username = "test_pwd_user"
    initial_pwd = "InitialPassword123!"
    create_new_user(username, initial_pwd, role="user", full_name="Password Test User")

    # 1. Login dengan password awal
    login_res = client.post(
        "/api/auth/login",
        json={"username": username, "password": initial_pwd},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 2. Gagal jika password baru terlalu pendek (< 8 karakter)
    short_res = client.post(
        "/api/auth/change-password",
        json={"old_password": initial_pwd, "new_password": "short"},
        headers=auth_headers,
    )
    assert short_res.status_code == 400

    # 3. Gagal jika old_password salah
    wrong_old_res = client.post(
        "/api/auth/change-password",
        json={"old_password": "WrongOldPassword!", "new_password": "NewValidPassword123!"},
        headers=auth_headers,
    )
    assert wrong_old_res.status_code == 400

    # 4. Berhasil ganti password
    new_pwd = "NewValidPassword123!"
    change_res = client.post(
        "/api/auth/change-password",
        json={"old_password": initial_pwd, "new_password": new_pwd},
        headers=auth_headers,
    )
    assert change_res.status_code == 200
    assert change_res.json().get("status") == "success"

    # 5. Login dengan password lama harus ditolak
    failed_old = client.post(
        "/api/auth/login",
        json={"username": username, "password": initial_pwd},
    )
    assert failed_old.status_code == 401

    # 6. Login dengan password baru harus berhasil
    success_new = client.post(
        "/api/auth/login",
        json={"username": username, "password": new_pwd},
    )
    assert success_new.status_code == 200


def test_admin_reset_user_password(client, admin_auth, db):
    """Admin dapat mereset password pengguna lain."""
    username = "test_reset_user"
    create_new_user(username, "Temporary123!", role="user")

    new_admin_set_pwd = "AdminAssignedPwd123!"
    res = client.post(
        f"/api/admin/users/{username}/reset-password",
        json={"new_password": new_admin_set_pwd, "force_change": False},
        headers=admin_auth,
    )
    assert res.status_code == 200
    assert res.json().get("success") is True

    # Pengguna bisa login dengan password yang baru direset
    login_res = client.post(
        "/api/auth/login",
        json={"username": username, "password": new_admin_set_pwd},
    )
    assert login_res.status_code == 200


def test_admin_user_crud(client, admin_auth, db):
    """Operasi CRUD manajemen user oleh admin."""
    new_username = "crud_test_user"

    # 1. Create user
    create_res = client.post(
        "/api/admin/users",
        json={
            "username": new_username,
            "password": "InitialPassword123!",
            "role": "user",
            "full_name": "CRUD Test User",
        },
        headers=admin_auth,
    )
    assert create_res.status_code == 200

    # 2. Get/List users
    list_res = client.get("/api/admin/users", headers=admin_auth)
    assert list_res.status_code == 200
    users = list_res.json()
    assert any(u["username"] == new_username for u in users)

    # 3. Update user
    update_res = client.put(
        f"/api/admin/users/{new_username}",
        json={"full_name": "Updated Full Name", "role": "user"},
        headers=admin_auth,
    )
    assert update_res.status_code == 200

    # 4. Delete user
    del_res = client.delete(f"/api/admin/users/{new_username}", headers=admin_auth)
    assert del_res.status_code == 200

    # Pastikan user terhapus
    assert get_user_by_username(new_username) is None


def test_auth_logout_clears_cookie(client, make_user):
    """Endpoint /api/auth/logout menghapus cookie sesi."""
    auth = make_user("user_logout_test")
    res = client.post("/api/auth/logout", headers=auth)
    assert res.status_code == 200
    # Cek response sets deletion cookie (Max-Age=0 or empty value)
    assert "sap_session" in res.headers.get("set-cookie", "")

def test_auth_login_propagates_dashboard_token(client, db):
    """Login mengisi session_id dan _dashboard_tokens untuk propagasi ke MCP Gateway."""
    from auth import _dashboard_tokens, get_dashboard_access_token, decode_session_cookie
    from database import create_new_user

    test_user = "login_token_prop_test"
    create_new_user(username=test_user, password="Password123!", role="user")
    res = client.post("/api/auth/login", json={"username": test_user, "password": "Password123!"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    access_token = data.get("access_token")
    assert access_token is not None

    # Cek cookie sap_session memuat session_id
    cookie_val = res.cookies.get("sap_session")
    assert cookie_val is not None
    payload = decode_session_cookie(cookie_val)
    assert payload is not None
    session_id = payload.get("session_id")
    assert session_id is not None
    assert session_id in _dashboard_tokens
    assert _dashboard_tokens[session_id][0] == access_token

    # Verifikasi pemanggilan get_current_user_optional menyetel contextvar token
    from unittest.mock import MagicMock
    from auth import get_current_user_optional

    req_cookie = MagicMock()
    req_cookie.cookies = {"sap_session": cookie_val}
    req_cookie.headers = {}
    user_cookie = get_current_user_optional(req_cookie)
    assert user_cookie["username"] == test_user
    assert get_dashboard_access_token() == access_token

    # Verifikasi pemanggilan dengan Bearer token langsung juga menyetel contextvar token
    req_bearer = MagicMock()
    req_bearer.cookies = {}
    req_bearer.headers = {"Authorization": f"Bearer {access_token}"}
    user_bearer = get_current_user_optional(req_bearer)
    assert user_bearer["username"] == test_user
    assert get_dashboard_access_token() == access_token
