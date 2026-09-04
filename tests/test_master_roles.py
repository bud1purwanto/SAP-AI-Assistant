"""Pengujian Fitur Master Data Roles (Dinamisasi Peran) dan Proteksi Integritas Data."""
import pytest
from sqlalchemy import text
from database import (
    get_engine,
    get_roles,
    get_role_by_code,
    get_role_codes,
    create_role,
    clone_role,
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


def test_disabling_role_does_not_revoke_current_holders(client, admin_auth):
    """'enabled=False' hanya menyembunyikan peran dari penetapan baru. Pemegang
    yang sudah ada TIDAK kehilangan akses apa pun -- ini yang membedakannya dari
    'suspended' (lihat test_suspended_role_realtime_revocation)."""
    code = "temp_auditor_disable"
    client.delete("/api/admin/users/auditor_user_01", headers=admin_auth)
    client.delete(f"/api/admin/roles/{code}", headers=admin_auth)

    try:
        res_role = client.post("/api/admin/roles", headers=admin_auth, json={
            "code": code,
            "label": "Temp Auditor",
            "can_modify_program": True,
            "enabled": True,
        })
        assert res_role.status_code == 200
        assert set_role_mode(code, "fast", True) is True

        res_user = client.post("/api/admin/users", headers=admin_auth, json={
            "username": "auditor_user_01",
            "password": "Password123!",
            "role": code,
            "roles": [code],
        })
        assert res_user.status_code == 200
        assert get_user_roles("auditor_user_01") == [code]

        # Nonaktifkan (bukan suspend) peran ini
        res_dis = client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={"enabled": False})
        assert res_dis.status_code == 200

        # Pemegang yang sudah ada TIDAK terpengaruh sama sekali
        assert get_user_roles("auditor_user_01") == [code]
        fresh_user = get_user_by_username("auditor_user_01")
        assert fresh_user["role"] == code
        can_mod = get_roles_can_modify_program()
        assert code in can_mod
        modes = get_modes_for_role(code)
        fast_mode = next((m for m in modes if m["code"] == "fast"), None)
        assert fast_mode["available"] is True

        # Tapi peran ini sekarang tidak bisa ditetapkan ke USER BARU
        res_new_user = client.post("/api/admin/users", headers=admin_auth, json={
            "username": "auditor_user_02_should_fail",
            "password": "Password123!",
            "role": code,
            "roles": [code],
        })
        assert res_new_user.status_code == 400
    finally:
        client.delete("/api/admin/users/auditor_user_01", headers=admin_auth)
        client.delete("/api/admin/users/auditor_user_02_should_fail", headers=admin_auth)
        try:
            delete_role(code)
        except ValueError:
            pass


def test_suspended_role_realtime_revocation(client, admin_auth):
    """'suspended=True' mencabut izin peran dari SELURUH pemegangnya seketika --
    ini mekanisme penegakan yang setara dengan 'enabled=False' versi lama."""
    code = "temp_auditor_suspend"
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

        # 3. Suspend peran
        res_dis = client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={
            "suspended": True,
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

        # 5. Un-suspend peran
        res_en = client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={
            "suspended": False,
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
        try:
            delete_role(code)
        except ValueError:
            pass


def test_system_role_cannot_be_suspended(client, admin_auth):
    res = client.put("/api/admin/roles/user", headers=admin_auth, json={"suspended": True})
    assert res.status_code == 400


def test_update_user_role_normalized_to_lowercase(client, admin_auth):
    """users.role harus selalu tersimpan lowercase, walau input admin memakai huruf besar.

    Regresi: sebelum diperbaiki, PUT /api/admin/users/{username} dengan role
    'Backend' (huruf besar) menyimpan 'Backend' apa adanya ke kolom users.role,
    sementara user_roles.role tersimpan 'backend' -> dua sumber data yang tidak
    sinkron, dan user_count di get_roles() salah hitung karena join tanpa LOWER().
    """
    client.delete("/api/admin/users/case_test_user", headers=admin_auth)
    res_create = client.post("/api/admin/users", headers=admin_auth, json={
        "username": "case_test_user",
        "password": "Password123!",
        "full_name": "Case Test",
        "role": "user",
        "roles": ["user"],
    })
    assert res_create.status_code == 200

    try:
        res_update = client.put("/api/admin/users/case_test_user", headers=admin_auth, json={
            "role": "Backend",
        })
        assert res_update.status_code == 200

        fresh = get_user_by_username("case_test_user")
        assert fresh["role"] == "backend"

        roles_matrix = {r["code"]: r["user_count"] for r in get_roles(enabled_only=False)}
        assert roles_matrix.get("backend", 0) >= 1
    finally:
        client.delete("/api/admin/users/case_test_user", headers=admin_auth)


def test_set_role_mode_unknown_role_returns_404_not_500(client, admin_auth):
    """PUT /api/admin/modes/roles dengan role yang tidak ada di master harus 404, bukan 500."""
    res = client.put("/api/admin/modes/roles", headers=admin_auth, json={
        "role": "role_yang_tidak_ada",
        "mode_code": "fast",
        "enabled": True,
    })
    assert res.status_code == 404


def test_update_access_role_unknown_role_returns_404_not_500(client, admin_auth):
    """PUT /api/admin/access/roles dengan role yang tidak ada di master harus 404, bukan 500."""
    res = client.put("/api/admin/access/roles", headers=admin_auth, json={
        "role": "role_yang_tidak_ada",
        "items": [],
    })
    assert res.status_code == 404


class _FakeEmptyResult:
    def fetchall(self):
        return []


class _FakeEmptyConn:
    def execute(self, *args, **kwargs):
        return _FakeEmptyResult()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class _FakeEmptyEngine:
    def connect(self):
        return _FakeEmptyConn()


def test_get_role_codes_empty_table_does_not_resurrect_hardcoded_roles(db, monkeypatch):
    """Bila query BERHASIL tapi tabel roles kosong (bukan exception), harus mengembalikan
    [] apa adanya -- bukan diam-diam mengembalikan 9 role hardcode yang mungkin sudah
    tidak ada di database. Fallback hardcode hanya untuk kegagalan koneksi/exception."""
    import database as database_module

    monkeypatch.setattr(database_module, "get_engine", lambda: _FakeEmptyEngine())
    database_module.invalidate_role_codes_cache()

    assert database_module.get_role_codes(enabled_only=True) == []
    assert database_module.get_role_codes(enabled_only=False) == []


def test_get_role_codes_exception_still_uses_hardcoded_fallback(db, monkeypatch):
    """Bila koneksi DB benar-benar gagal (exception), fallback hardcode tetap dipakai
    agar sistem tidak lumpuh total saat database sedang bermasalah."""
    import database as database_module

    def _raise():
        raise RuntimeError("simulasi database down")

    monkeypatch.setattr(database_module, "get_engine", _raise)
    database_module.invalidate_role_codes_cache()

    codes = database_module.get_role_codes(enabled_only=True)
    assert "superadmin" in codes
    assert "user" in codes


def test_can_modify_program_cannot_be_revoked_from_superadmin(client, admin_auth):
    """superadmin.can_modify_program tidak boleh dicabut -- agent.py tidak memberi
    bypass superadmin untuk hak mutasi program seperti assert_can_use, jadi mencabutnya
    di master role benar-benar mengunci superadmin dari fitur ubah program."""
    res = client.put("/api/admin/roles/superadmin", headers=admin_auth, json={
        "can_modify_program": False,
    })
    assert res.status_code == 400

    still_ok = get_role_by_code("superadmin")
    assert still_ok["can_modify_program"] is True


def test_role_crud_writes_audit_log(client, admin_auth):
    """Create/update/delete role harus tercatat di access_audit."""
    code = "audit_check_role"
    client.delete(f"/api/admin/roles/{code}", headers=admin_auth)

    res_create = client.post("/api/admin/roles", headers=admin_auth, json={
        "code": code,
        "label": "Audit Check Role",
    })
    assert res_create.status_code == 200

    res_update = client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={
        "label": "Audit Check Role Updated",
    })
    assert res_update.status_code == 200

    res_delete = client.delete(f"/api/admin/roles/{code}", headers=admin_auth)
    assert res_delete.status_code == 200

    logs_res = client.get("/api/admin/access/audit?limit=50", headers=admin_auth)
    assert logs_res.status_code == 200
    logs = logs_res.json()["logs"]
    actions_for_role = [
        (l["action"], l["target_id"]) for l in logs if l["target_id"] == code
    ]
    assert ("CREATE_ROLE", code) in actions_for_role
    assert ("UPDATE_ROLE", code) in actions_for_role
    assert ("DELETE_ROLE", code) in actions_for_role


def test_users_role_column_rejects_uppercase_and_unknown_role(db):
    """Migrasi 0014: CHECK + FK pada users.role menolak input yang tidak sesuai
    langsung di level database, terlepas dari validasi aplikasi."""
    engine = get_engine()
    with engine.connect() as conn:
        constraints = conn.execute(text("""
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'ai_assistant' AND table_name = 'users'
              AND constraint_name IN ('chk_users_role_lowercase', 'fk_users_role')
        """)).fetchall()
        names = {c.constraint_name for c in constraints}
        assert "chk_users_role_lowercase" in names
        assert "fk_users_role" in names

        with pytest.raises(Exception):
            with conn.begin():
                conn.execute(text("""
                    INSERT INTO ai_assistant.users (username, password_hash, role)
                    VALUES ('bad_role_case_test', 'x', 'Backend')
                """))

        with pytest.raises(Exception):
            with conn.begin():
                conn.execute(text("""
                    INSERT INTO ai_assistant.users (username, password_hash, role)
                    VALUES ('bad_role_fk_test', 'x', 'role_yang_tidak_pernah_ada')
                """))


def test_clone_role_copies_permissions_and_quota(client, admin_auth):
    """clone_role() menyalin izin resource MCP, mode chat, warna/ikon, dan kuota
    dari peran sumber ke peran baru -- bukan mulai dari nol seperti create_role biasa."""
    source_code = "clone_src_role"
    cloned_code = "clone_dst_role"
    for c in (source_code, cloned_code):
        try:
            delete_role(c)
        except ValueError:
            pass

    try:
        # 1. Buat peran sumber dengan atribut & kuota yang berbeda dari default
        create_role(
            code=source_code,
            label="Clone Source",
            description="Peran sumber untuk uji kloning",
            color="rose",
            icon="key",
            can_modify_program=True,
            enabled=True,
            daily_token_limit=250000,
            per_minute_limit=15,
        )
        set_role_mode(source_code, "expert", True)

        # Beri izin resource MCP pada peran sumber lewat endpoint access control
        res_access = client.put("/api/admin/access/roles", headers=admin_auth, json={
            "role": source_code,
            "items": [{"resource_key": "service:rag", "allowed": True, "can_write": False}],
        })
        assert res_access.status_code == 200

        # 2. Kloning
        res_clone = client.post(f"/api/admin/roles/{source_code}/clone", headers=admin_auth, json={
            "code": cloned_code,
            "label": "Clone Destination",
        })
        assert res_clone.status_code == 200, res_clone.text
        cloned = res_clone.json()["role"]

        # 3. Verifikasi atribut & kuota tersalin
        assert cloned["color"] == "rose"
        assert cloned["icon"] == "key"
        assert cloned["can_modify_program"] is True

        cloned_full = get_role_by_code(cloned_code)
        assert cloned_full["is_system"] is False

        # 4. Verifikasi izin mode chat tersalin (bukan default-deny)
        cloned_modes = get_modes_for_role(cloned_code)
        expert_mode = next((m for m in cloned_modes if m["code"] == "expert"), None)
        assert expert_mode is not None
        assert expert_mode["available"] is True

        # 5. Verifikasi izin resource MCP tersalin
        user_matrix_res = client.get(f"/api/admin/access/roles", headers=admin_auth)
        matrix = user_matrix_res.json()["matrix"]
        assert matrix.get(cloned_code, {}).get("service:rag", {}).get("allowed") is True
    finally:
        for c in (source_code, cloned_code):
            try:
                delete_role(c)
            except ValueError:
                pass


def test_clone_role_rejects_duplicate_or_missing_source(client, admin_auth):
    """Kloning ke kode yang sudah ada, atau dari peran sumber yang tidak ada, harus ditolak (400)."""
    res_dup = client.post("/api/admin/roles/user/clone", headers=admin_auth, json={
        "code": "user",  # sudah ada
        "label": "Duplicate",
    })
    assert res_dup.status_code == 400

    res_missing_src = client.post("/api/admin/roles/role_sumber_tidak_ada/clone", headers=admin_auth, json={
        "code": "some_new_role_xyz",
        "label": "New Role",
    })
    assert res_missing_src.status_code == 400


def test_role_impact_preview(client, admin_auth):
    """GET /api/admin/roles/{code}/impact melaporkan user, resource, dan mode
    terdampak dengan akurat -- termasuk deteksi user yang akan turun total ke
    'Standard User' karena ini satu-satunya peran mereka."""
    code = "impact_preview_role"
    try:
        delete_role(code)
    except ValueError:
        pass
    client.delete("/api/admin/users/impact_user_solo", headers=admin_auth)
    client.delete("/api/admin/users/impact_user_multi", headers=admin_auth)

    try:
        create_role(code=code, label="Impact Preview Role", can_modify_program=False)
        set_role_mode(code, "fast", True)
        set_role_mode(code, "medium", True)

        client.put("/api/admin/access/roles", headers=admin_auth, json={
            "role": code,
            "items": [{"resource_key": "service:rag", "allowed": True, "can_write": False}],
        })

        # User dengan HANYA peran ini
        client.post("/api/admin/users", headers=admin_auth, json={
            "username": "impact_user_solo",
            "password": "Password123!",
            "role": code,
            "roles": [code],
        })
        # User dengan peran ini DAN peran lain
        client.post("/api/admin/users", headers=admin_auth, json={
            "username": "impact_user_multi",
            "password": "Password123!",
            "role": code,
            "roles": [code, "functional"],
        })

        res = client.get(f"/api/admin/roles/{code}/impact", headers=admin_auth)
        assert res.status_code == 200
        data = res.json()

        assert data["resource_count"] == 1
        assert data["mode_count"] == 2

        by_username = {u["username"]: u for u in data["affected_users"]}
        assert "impact_user_solo" in by_username
        assert "impact_user_multi" in by_username
        assert by_username["impact_user_solo"]["only_role"] is True
        assert by_username["impact_user_multi"]["only_role"] is False
    finally:
        client.delete("/api/admin/users/impact_user_solo", headers=admin_auth)
        client.delete("/api/admin/users/impact_user_multi", headers=admin_auth)
        try:
            delete_role(code)
        except ValueError:
            pass


def test_role_impact_unknown_role_404(client, admin_auth):
    res = client.get("/api/admin/roles/role_tidak_ada_xyz/impact", headers=admin_auth)
    assert res.status_code == 404


def test_quota_unaffected_by_disable_but_lost_on_suspend(client, admin_auth):
    """Kuota token milik peran (role_limits) HARUS tetap berlaku untuk pemegang saat
    ini walau peran di-'enabled=False' (deprecated untuk penetapan baru), tapi HILANG
    saat peran di-suspend -- menguji regresi _batas_peran() memakai get_active_role_codes()
    (berbasis suspended), bukan get_available_roles() (berbasis enabled)."""
    code = "quota_split_role"
    client.delete("/api/admin/users/quota_split_user", headers=admin_auth)
    try:
        delete_role(code)
    except ValueError:
        pass

    try:
        client.post("/api/admin/roles", headers=admin_auth, json={
            "code": code,
            "label": "Quota Split Role",
            "daily_token_limit": 777000,
            "per_minute_limit": 7,
        })
        res_user = client.post("/api/admin/users", headers=admin_auth, json={
            "username": "quota_split_user",
            "password": "Password123!",
            "role": code,
            "roles": [code],
        })
        assert res_user.status_code == 200
        login = client.post("/api/login", json={"username": "quota_split_user", "password": "Password123!"})
        auth = {"Authorization": f"Bearer {login.json()['access_token']}"}

        # Baseline: kuota peran berlaku
        res_q1 = client.get("/api/quota", headers=auth)
        assert res_q1.json()["daily_token_limit"] == 777000

        # Nonaktifkan (bukan suspend): kuota TIDAK berubah untuk pemegang saat ini
        client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={"enabled": False})
        res_q2 = client.get("/api/quota", headers=auth)
        assert res_q2.json()["daily_token_limit"] == 777000

        # Suspend: kuota jatuh ke default 'user'
        client.put(f"/api/admin/roles/{code}", headers=admin_auth, json={"suspended": True})
        res_q3 = client.get("/api/quota", headers=auth)
        assert res_q3.json()["daily_token_limit"] != 777000
    finally:
        client.delete("/api/admin/users/quota_split_user", headers=admin_auth)
        try:
            delete_role(code)
        except ValueError:
            pass
