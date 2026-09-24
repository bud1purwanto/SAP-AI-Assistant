"""Pengujian session cookie, otorisasi endpoint, dan manajemen user."""
from database import get_user_by_username


def test_user_name_header_no_longer_authenticates(client):
    """Identitas tidak boleh diambil dari header yang dapat dipalsukan."""
    client.cookies.clear()
    res = client.get("/api/admin/users", headers={"X-User-Name": "TRSTDEV"})
    assert res.status_code == 401



def test_admin_user_crud(client, admin_auth, db):
    """Operasi CRUD manajemen user oleh admin."""
    new_username = "crud_test_user"

    # 1. Create user (identitas dikelola Dashboard OIDC; tanpa password lokal)
    create_res = client.post(
        "/api/admin/users",
        json={
            "username": new_username,
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

