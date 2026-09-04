"""Pengujian Fitur Master Data Roles (Dinamisasi Peran) dan Proteksi Integritas Data."""
import pytest
from sqlalchemy import text
from database import (
    get_engine,
    get_roles,
    get_role_by_code,
    get_role_codes,
    create_role,
    update_role,
    delete_role,
    get_modes_for_role,
    set_role_mode,
    get_roles_can_modify_program,
    get_user_roles,
    get_user_by_username,
)


def test_default_roles_seeded_and_column_widths(db):
    """Memastikan 9 peran bawaan telah di-seed dan lebar kolom adalah VARCHAR(40)."""
    roles = get_roles(enabled_only=False)
    codes = [r["code"] for r in roles]
    expected = ["superadmin", "abaper", "functional", "backend", "frontend", "basis", "data_analyst", "user", "guest"]
    for exp in expected:
        assert exp in codes

    # Cek lebar kolom VARCHAR(40) pada ai_assistant.users dan ai_assistant.role_limits
    engine = get_engine()
    with engine.connect() as conn:
        users_col_len = conn.execute(text("""
            SELECT character_maximum_length FROM information_schema.columns
            WHERE table_schema = 'ai_assistant' AND table_name = 'users' AND column_name = 'role'
        """)).scalar()
        assert users_col_len == 40

        limits_col_len = conn.execute(text("""
            SELECT character_maximum_length FROM information_schema.columns
            WHERE table_schema = 'ai_assistant' AND table_name = 'role_limits' AND column_name = 'role'
        """)).scalar()
        assert limits_col_len == 40


def test_create_custom_role_with_quota_and_least_privilege(db):
    """Peran baru otomatis mendapatkan kuota default dan default-deny pada seluruh mode LLM."""
    code = "security_auditor"
    role = create_role(
        code=code,
        label="Security Auditor",
        description="Auditor kepatuhan dan keamanan sistem",
        color="amber",
        icon="shield",
        can_modify_program=False,
        enabled=True,
        daily_token_limit=150000,
        per_minute_limit=8,
    )
    assert role["code"] == code
    assert role["label"] == "Security Auditor"
    assert role["can_modify_program"] is False

    # Verifikasi kuota awal di role_limits
    engine = get_engine()
    with engine.connect() as conn:
        limits = conn.execute(
            text("SELECT daily_token_limit, per_minute_limit FROM ai_assistant.role_limits WHERE role = :r"),
            {"r": code}
        ).fetchone()
        assert limits is not None
        assert limits.daily_token_limit == 150000
        assert limits.per_minute_limit == 8

    # Verifikasi least-privilege: semua mode chat bernilai available = False
    modes = get_modes_for_role(code)
    for m in modes:
        assert m["available"] is False, f"Mode {m['code']} harusnya default-deny untuk role baru"

    # Verifikasi tidak ada dalam peran pengubah program
    can_mod = get_roles_can_modify_program()
    assert code not in can_mod

    # Cleanup
    delete_role(code)


def test_create_role_validation(client, admin_auth):
    """Validasi format kode peran, label wajib, dan keunikan kode."""
    # 1. Kode dengan spasi / karakter ilegal
    res = client.post("/api/admin/roles", headers=admin_auth, json={
        "code": "invalid role code",
        "label": "Invalid Role",
    })
    assert res.status_code == 400

    # 2. Kode terlalu panjang (> 40 karakter)
    res = client.post("/api/admin/roles", headers=admin_auth, json={
        "code": "a" * 41,
        "label": "Too Long Role",
    })
    assert res.status_code == 400

    # 3. Label kosong
    res = client.post("/api/admin/roles", headers=admin_auth, json={
        "code": "empty_label_role",
        "label": "   ",
    })
    assert res.status_code == 400

    # 4. Kode duplikat dengan peran yang sudah ada
    res = client.post("/api/admin/roles", headers=admin_auth, json={
        "code": "superadmin",
        "label": "Super Admin Duplikat",
    })
    assert res.status_code == 400


def test_update_custom_role(client, admin_auth):
    """Admin dapat mengupdate label, deskripsi, warna, dan proteksi peran sistem dari penonaktifan."""
    # Buat custom role
    code = "tester_role"
    res = client.post("/api/admin/roles", headers=admin_auth, json={
        "code": code,
        "label": "Tester Role",
        "description": "Peran khusus pengujian",
        "color": "cyan",
        "can_modify_program": False,
    })
    assert res.status_code == 200

    # Update role
    res_up = client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={
        "label": "Updated Tester Role",
        "description": "Deskripsi diperbarui",
        "can_modify_program": True,
    })
    assert res_up.status_code == 200
    updated = res_up.json()["role"]
    assert updated["label"] == "Updated Tester Role"
    assert updated["description"] == "Deskripsi diperbarui"
    assert updated["can_modify_program"] is True

    # Verifikasi bahwa peran ini kini berhak mengubah program
    can_mod = get_roles_can_modify_program()
    assert code in can_mod

    # Coba nonaktifkan peran sistem (harus ditolak)
    res_sys = client.put("/api/admin/roles/superadmin", headers=admin_auth, json={
        "enabled": False
    })
    assert res_sys.status_code == 400

    # Cleanup
    client.delete(f"/api/admin/roles/{code}", headers=admin_auth)


def test_delete_role_guards(db, make_user):
    """Proteksi penghapusan: peran sistem dan peran yang sedang dipakai user tidak boleh dihapus."""
    # 1. Hapus peran sistem harus gagal
    with pytest.raises(ValueError, match="system role"):
        delete_role("superadmin")

    with pytest.raises(ValueError, match="system role"):
        delete_role("user")

    # 2. Buat peran kustom dan tetapkan ke user
    code = "assigned_role"
    create_role(code=code, label="Assigned Role")
    make_user("assigned_user", role=code)

    # Hapus harus gagal karena sedang dipakai
    with pytest.raises(ValueError, match="currently assigned"):
        delete_role(code)

    # Hapus user pemakai terlebih dahulu dari database
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM ai_assistant.users WHERE username = 'assigned_user'"))
        conn.commit()

    # Sekarang hapus harus sukses
    assert delete_role(code) is True
    assert get_role_by_code(code) is None


def test_admin_roles_endpoints_permissions(client, make_user, admin_auth):
    """Superadmin memiliki hak penuh, user biasa 403, dan anonim 401."""
    # 1. Anonim -> 401
    assert client.get("/api/admin/roles").status_code == 401

    # 2. Standard user -> 403
    user_auth = make_user("regular_user_roles_test", role="user")
    assert client.get("/api/admin/roles", headers=user_auth).status_code == 403
    assert client.post("/api/admin/roles", headers=user_auth, json={"code": "x", "label": "X"}).status_code == 403

    # 3. Superadmin -> 200
    res = client.get("/api/admin/roles", headers=admin_auth)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_user_creation_with_long_role_code(client, admin_auth):
    """Pembuatan user dengan role kustom panjang (> 20 karakter) sukses tanpa pemotongan/truncation."""
    long_role = "sap_integration_consultant"  # 26 karakter
    # 1. Buat role
    res_role = client.post("/api/admin/roles", headers=admin_auth, json={
        "code": long_role,
        "label": "SAP Integration Consultant",
    })
    assert res_role.status_code == 200

    # 2. Buat user dengan role ini
    res_user = client.post("/api/admin/users", headers=admin_auth, json={
        "username": "consultant_01",
        "password": "Password123!",
        "full_name": "Consultant One",
        "role": long_role,
        "roles": [long_role],
    })
    assert res_user.status_code == 200
    assert res_user.json()["success"] is True

    # 3. Verifikasi user berhasil tersimpan dengan role panjang dan user_count bertambah
    role_detail = get_role_by_code(long_role)
    assert role_detail["user_count"] >= 1

    # Cleanup: hapus user dulu baru hapus role
    client.delete("/api/admin/users/consultant_01", headers=admin_auth)
    client.delete(f"/api/admin/roles/{long_role}", headers=admin_auth)


def test_disabled_role_realtime_revocation(client, admin_auth):
    """Memverifikasi penegakan status nonaktif peran secara real-time (revocation)."""
    code = "temp_auditor"
    # Pre-cleanup
    client.delete("/api/admin/users/auditor_user_01", headers=admin_auth)
    client.delete(f"/api/admin/roles/{code}", headers=admin_auth)

    try:
        # 1. Buat peran
        res_role = client.post("/api/admin/roles", headers=admin_auth, json={
            "code": code,
            "label": "Temp Auditor",
            "description": "Peran pengujian pencabutan akses",
            "can_modify_program": True,
            "enabled": True,
        })
        assert res_role.status_code == 200

        # Beri izin salah satu mode chat yang ada (fast)
        assert set_role_mode(code, "fast", True) is True

        # 2. Buat user dengan peran ini
        res_user = client.post("/api/admin/users", headers=admin_auth, json={
            "username": "auditor_user_01",
            "password": "Password123!",
            "full_name": "Auditor One",
            "role": code,
            "roles": [code],
        })
        assert res_user.status_code == 200

        # Verifikasi saat aktif: user memegang peran code
        assert get_user_roles("auditor_user_01") == [code]
        user_info = get_user_by_username("auditor_user_01")
        assert user_info["role"] == code
        assert user_info["roles"] == [code]

        # Verifikasi mode chat available
        modes = get_modes_for_role(code)
        fast_mode = next((m for m in modes if m["code"] == "fast"), None)
        assert fast_mode is not None
        assert fast_mode["available"] is True

        # 3. Nonaktifkan peran
        res_dis = client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={
            "enabled": False,
        })
        assert res_dis.status_code == 200

        # 4. Verifikasi seketika (real-time):
        # a. get_user_roles fallback ke ['user']
        assert get_user_roles("auditor_user_01") == ["user"]
        # b. get_user_by_username fallback ke 'user'
        fresh_user = get_user_by_username("auditor_user_01")
        assert fresh_user["role"] == "user"
        assert fresh_user["roles"] == ["user"]
        # c. can_modify_program dicabut
        can_mod = get_roles_can_modify_program()
        assert code not in can_mod
        # d. mode chat available menjadi False
        modes_disabled = get_modes_for_role(code)
        fast_mode_dis = next((m for m in modes_disabled if m["code"] == "fast"), None)
        assert fast_mode_dis["available"] is False

        # 5. Aktifkan kembali peran
        res_en = client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={
            "enabled": True,
        })
        assert res_en.status_code == 200

        # 6. Verifikasi izin pulih kembali
        assert get_user_roles("auditor_user_01") == [code]
        modes_restored = get_modes_for_role(code)
        fast_mode_res = next((m for m in modes_restored if m["code"] == "fast"), None)
        assert fast_mode_res["available"] is True
    finally:
        # Cleanup
        client.delete("/api/admin/users/auditor_user_01", headers=admin_auth)
        client.delete(f"/api/admin/roles/{code}", headers=admin_auth)
