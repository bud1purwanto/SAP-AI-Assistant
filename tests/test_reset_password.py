import pytest
from database import get_engine, text, list_all_users, get_user_by_username


def test_admin_reset_password_flow(client, admin_auth, make_user):
    """Pengujian alur reset password oleh admin dan kewajiban ganti password pengguna."""
    username = "test_reset_user"
    initial_auth = make_user(username, password="OldPassword123")

    # 1. Pastikan status awal force_change_password adalah False
    user_info = get_user_by_username(username)
    assert user_info is not None
    assert user_info.get("force_change_password") is False

    # 2. Admin melakukan reset password user
    temp_pass = "TempPassword123"
    res = client.post(
        f"/api/admin/users/{username}/reset-password",
        json={"password": temp_pass, "force_change_password": True},
        headers=admin_auth,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["success"] is True

    # 3. List users untuk admin harus memuat force_change_password == True (status Pending Reset)
    res_list = client.get("/api/admin/users", headers=admin_auth)
    assert res_list.status_code == 200
    users = res_list.json()
    target_user = next((u for u in users if u["username"].lower() == username.lower()), None)
    assert target_user is not None
    assert target_user.get("force_change_password") is True

    # 4. User login dengan password sementara -> berhasil, mengembalikan force_change_password == True
    login_res = client.post("/api/login", json={"username": username, "password": temp_pass})
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["force_change_password"] is True
    user_token = login_data["access_token"]
    user_auth = {"Authorization": f"Bearer {user_token}"}

    # /api/me juga mengembalikan force_change_password == True
    me_res = client.get("/api/me", headers=user_auth)
    assert me_res.status_code == 200
    assert me_res.json().get("force_change_password") is True

    # 5. User melakukan penggantian password pribadi via /api/change-password TANPA old_password
    new_personal_pass = "MyNewSecretPassword123"
    change_res = client.post(
        "/api/change-password",
        json={"new_password": new_personal_pass},
        headers=user_auth,
    )
    assert change_res.status_code == 200, change_res.text

    # 6. Verifikasi force_change_password kembali menjadi False (Pending Reset hilang)
    me_after = client.get("/api/me", headers=user_auth)
    assert me_after.status_code == 200
    assert me_after.json().get("force_change_password") is False

    # 6b. Setelah force_change_password menjadi False, penggantian password reguler WAJIB menyertakan old_password
    regular_change_no_old = client.post(
        "/api/change-password",
        json={"new_password": "YetAnotherPassword123"},
        headers=user_auth,
    )
    assert regular_change_no_old.status_code == 400
    assert "Password lama wajib diisi" in regular_change_no_old.text

    res_list_after = client.get("/api/admin/users", headers=admin_auth)
    assert res_list_after.status_code == 200
    target_after = next((u for u in res_list_after.json() if u["username"].lower() == username.lower()), None)
    assert target_after is not None
    assert target_after.get("force_change_password") is False

    # 7. Login berikutnya dengan password baru pribadi
    new_login_res = client.post("/api/login", json={"username": username, "password": new_personal_pass})
    assert new_login_res.status_code == 200
    assert new_login_res.json().get("force_change_password") is False


def test_admin_reset_password_validations(client, admin_auth, make_user):
    """Pengujian validasi panjang password dan kompatibilitas payload new_password/password."""
    username = "test_val_user"
    make_user(username, password="InitialPassword123")

    # 1. Password terlalu pendek (< 8 karakter) -> 400
    res_short = client.post(
        f"/api/admin/users/{username}/reset-password",
        json={"password": "123", "force_change_password": True},
        headers=admin_auth,
    )
    assert res_short.status_code == 400
    assert "minimal 8 karakter" in res_short.text

    # 2. Menggunakan key 'new_password' alih-alih 'password' -> harus didukung
    res_alt_key = client.post(
        f"/api/admin/users/{username}/reset-password",
        json={"new_password": "AlternativeValidPass123", "force_change_password": True},
        headers=admin_auth,
    )
    assert res_alt_key.status_code == 200
    assert res_alt_key.json()["success"] is True

    # 3. User tidak ditemukan -> 400
    res_not_found = client.post(
        "/api/admin/users/non_existent_user_9999/reset-password",
        json={"password": "ValidPassword123", "force_change_password": True},
        headers=admin_auth,
    )
    assert res_not_found.status_code == 400


