import pytest
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
import access_control
import database


def test_master_switch_off_allows_all(monkeypatch):
    """Bila master switch OFF, semua user berhak mengakses server tanpa batasan (regresi nol)."""
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: False)
    access_control.clear_access_cache()

    # Tidak boleh melempar HTTPException
    access_control.assert_can_use("budi", "user", "sap:prod-aix", need_write=False)
    access_control.assert_can_use("budi", "user", "sap:prod-aix", need_write=True)
    access_control.assert_can_use("tamu", "guest", "sql:dev-224", need_write=False)

    connectors = access_control.allowed_connectors("budi", "user")
    assert "sap" in connectors
    assert "sql" in connectors
    assert "rag" in connectors
    assert "email" in connectors


def test_master_switch_on_deny_total_default(monkeypatch):
    """Bila master switch ON dan belum ada izin di-seed, user biasa di-deny total."""
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: True)
    access_control.clear_access_cache()

    with pytest.raises(HTTPException) as exc:
        access_control.assert_can_use("user_tanpa_izin", "user", "sap:prod-aix")
    assert exc.value.status_code == 403
    assert "Akses ditolak" in exc.value.detail


def test_superadmin_always_allowed(monkeypatch):
    """Superadmin selalu berhak mengakses semua server walau switch ON dan belum ada baris izin."""
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: True)
    access_control.clear_access_cache()

    access_control.assert_can_use("admin", "superadmin", "sap:prod-aix", need_write=True)
    access_control.assert_can_use("admin", "superadmin", "sql:dev-224", need_write=True)

    connectors = access_control.allowed_connectors("admin", "superadmin")
    assert connectors == {"sap", "sql", "rag", "email"}


def test_role_inheritance_and_user_override(monkeypatch):
    """Test pewarisan Role dan override per User (tri-state: allow / deny / inherit)."""
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: True)
    access_control.clear_access_cache()

    # Siapkan data tiruan untuk database
    role_perms = [
        ("abaper", "sap:dev-aix", True, True),
        ("abaper", "sap:sandbox-new", True, False),
    ]
    user_perms = [
        # Override spesifik: user budi di-deny pada sap:dev-aix
        ("budi", "sap:dev-aix", False, False, None),
        # Override spesifik: user budi di-allow write pada sap:sandbox-new
        ("budi", "sap:sandbox-new", True, True, None),
    ]

    class FakeConn:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def execute(self, q, params=None):
            q_str = str(q)
            if "mcp_resources" in q_str:
                return type("R", (), {"fetchall": lambda self: [
                    ("sap:dev-aix", "sap", "Development AIX", "TRD", "130", False, None, None, False),
                    ("sap:sandbox-new", "sap", "Sandbox New Company", "TRS", "130", False, None, None, False),
                ]})()
            if "role_resource_access" in q_str:
                r = (params or {}).get("role", "")
                rows = [(rk, al, cw) for (ro, rk, al, cw) in role_perms if ro == r]
                return type("R", (), {"fetchall": lambda self: rows})()
            if "user_resource_access" in q_str:
                u = (params or {}).get("u", "")
                rows = [(rk, al, cw, vu) for (us, rk, al, cw, vu) in user_perms if us == u]
                return type("R", (), {"fetchall": lambda self: rows})()
            return type("R", (), {"fetchall": lambda self: []})()

    class FakeEngine:
        def connect(self):
            return FakeConn()

    monkeypatch.setattr(database, "get_engine", lambda: FakeEngine())

    # User biasa dengan role abaper (mewarisi role)
    res_tono = access_control.resolve_access("tono", "abaper")
    assert res_tono["sap:dev-aix"]["allowed"] is True
    assert res_tono["sap:dev-aix"]["can_write"] is True
    assert res_tono["sap:dev-aix"]["source"] == "role"

    # User budi (punya override)
    res_budi = access_control.resolve_access("budi", "abaper")
    # budi di-deny pada dev-aix
    assert res_budi["sap:dev-aix"]["allowed"] is False
    assert res_budi["sap:dev-aix"]["source"] == "user_override"
    # budi di-allow write pada sandbox-new
    assert res_budi["sap:sandbox-new"]["allowed"] is True
    assert res_budi["sap:sandbox-new"]["can_write"] is True


def test_user_override_expiration(monkeypatch):
    """Override user yang sudah lewat valid_until harus diabaikan dan kembali mewarisi role."""
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: True)
    access_control.clear_access_cache()

    now = datetime.now(timezone.utc)
    expired_time = now - timedelta(hours=1)

    role_perms = [
        ("functional", "sap:qa", True, False),
    ]
    # Override user sudah kedaluwarsa
    user_perms = [
        ("siti", "sap:qa", True, True, expired_time),
    ]

    class FakeConn:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def execute(self, q, params=None):
            q_str = str(q)
            if "mcp_resources" in q_str:
                return type("R", (), {"fetchall": lambda self: [
                    ("sap:qa", "sap", "QA", "TRQ", "320", False, None, None, False),
                ]})()
            if "role_resource_access" in q_str:
                rows = [(rk, al, cw) for (ro, rk, al, cw) in role_perms]
                return type("R", (), {"fetchall": lambda self: rows})()
            if "user_resource_access" in q_str:
                rows = [(rk, al, cw, vu) for (us, rk, al, cw, vu) in user_perms]
                return type("R", (), {"fetchall": lambda self: rows})()
            return type("R", (), {"fetchall": lambda self: []})()

    class FakeEngine:
        def connect(self):
            return FakeConn()

    monkeypatch.setattr(database, "get_engine", lambda: FakeEngine())

    res_siti = access_control.resolve_access("siti", "functional")
    # Karena override kedaluwarsa, kembali ke izin role (can_write: False)
    assert res_siti["sap:qa"]["allowed"] is True
    assert res_siti["sap:qa"]["can_write"] is False
    assert res_siti["sap:qa"]["source"] == "role"


def test_filter_servers_for_user(monkeypatch):
    """filter_servers_for_user menyembunyikan server yang tidak diizinkan."""
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: True)
    access_control.clear_access_cache()

    # Mock resolve_access agar hanya mengizinkan sap:sandbox-new
    def fake_resolve(username, role):
        return {
            "sap:sandbox-new": {"allowed": True, "can_write": True},
            "sap:dev-aix": {"allowed": False, "can_write": False},
            "sap:prod-aix": {"allowed": False, "can_write": False},
        }

    monkeypatch.setattr(access_control, "resolve_access", fake_resolve)

    raw_status = {
        "sap": {
            "online": True,
            "sub_servers": [
                {"name": "Sandbox New Company", "aliases": ["sandbox-new"]},
                {"name": "Development AIX", "aliases": ["dev-aix"]},
                {"name": "Production AIX", "aliases": ["prod-aix"]},
            ],
        },
        "sql": {
            "online": True,
            "sub_servers": [
                {"name": "dev-224"},
            ],
        },
    }

    filtered = access_control.filter_servers_for_user(raw_status, "budi", "user")
    sap_subs = filtered["sap"]["sub_servers"]
    assert len(sap_subs) == 1
    assert sap_subs[0]["name"] == "Sandbox New Company"

    # SQL tidak ada yang diizinkan
    sql_subs = filtered["sql"]["sub_servers"]
    assert len(sql_subs) == 0


def test_multi_role_union_resolution(monkeypatch):
    """Pengguna dengan multiple role mendapatkan izin gabungan (Union) paling permisif."""
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: True)
    access_control.clear_access_cache()

    role_perms = [
        ("abaper", "sap:dev-aix", True, True),
        ("backend", "sql:dev-224", True, True),
    ]

    class FakeConn:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def execute(self, q, params=None):
            q_str = str(q)
            if "mcp_resources" in q_str:
                return type("R", (), {"fetchall": lambda self: [
                    ("sap:dev-aix", "sap", "Development AIX", "TRD", "130", False, None, None, False),
                    ("sql:dev-224", "sql", "dev-224", "", "", False, None, None, False),
                ]})()
            if "role_resource_access" in q_str:
                roles_param = (params or {}).get("roles", [])
                rows = [(rk, al, cw) for (ro, rk, al, cw) in role_perms if ro in roles_param]
                return type("R", (), {"fetchall": lambda self: rows})()
            if "user_resource_access" in q_str:
                return type("R", (), {"fetchall": lambda self: []})()
            return type("R", (), {"fetchall": lambda self: []})()

    class FakeEngine:
        def connect(self):
            return FakeConn()

    monkeypatch.setattr(database, "get_engine", lambda: FakeEngine())

    # User dengan multi role: abaper + backend
    res = access_control.resolve_access("alex", ["abaper", "backend"])
    assert res["sap:dev-aix"]["allowed"] is True
    assert res["sap:dev-aix"]["can_write"] is True
    assert res["sql:dev-224"]["allowed"] is True
    assert res["sql:dev-224"]["can_write"] is True


def test_multi_role_superadmin_bypass(monkeypatch):
    """Bila salah satu dari multiple role adalah superadmin, user otomatis Full Bypass."""
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: True)
    access_control.clear_access_cache()

    monkeypatch.setattr(access_control, "get_all_resources", lambda include_archived=False: [
        {"resource_key": "sap:dev-aix", "kind": "sap", "label": "Dev", "is_production": False},
        {"resource_key": "sql:dev-224", "kind": "sql", "label": "SQL", "is_production": False},
    ])

    res = access_control.resolve_access("boss", ["user", "superadmin"])
    assert res["sap:dev-aix"]["allowed"] is True
    assert res["sql:dev-224"]["allowed"] is True
    assert res["sap:dev-aix"]["source"] == "superadmin"


def test_role_change_listener_clears_cache_on_cross_connection_notify(db):
    """LISTEN/NOTIFY lintas-worker: sebuah NOTIFY yang dikirim dari koneksi Postgres
    LAIN (mensimulasikan proses worker uvicorn lain) harus membuat listener yang
    berjalan di proses ini membersihkan cache role/izin lokalnya -- ini yang
    membuat perubahan role terlihat instan di semua worker, bukan menunggu TTL 30 detik."""
    import asyncio
    from sqlalchemy import text
    import database as database_module

    async def _run():
        listener = access_control.start_role_change_listener()
        try:
            # Beri waktu listener benar-benar tersambung dan LISTEN sebelum diuji.
            await asyncio.sleep(0.5)

            # Kotori cache lokal agar bisa dideteksi apakah listener membersihkannya.
            access_control._ACCESS_CACHE[("dummy_user", ("user",))] = (0.0, {})
            access_control._ROLES_CACHE["dummy_user"] = (0.0, ["user"])
            assert access_control._ACCESS_CACHE
            assert access_control._ROLES_CACHE

            # Kirim NOTIFY dari KONEKSI TERPISAH -- inilah yang dilakukan
            # broadcast_access_change() saat worker lain memutasi sebuah role/izin.
            engine = database_module.get_engine()
            with engine.connect() as conn:
                conn.execute(text("NOTIFY roles_changed"))
                conn.commit()

            # Beri waktu listener memproses notifikasi.
            cleared = False
            for _ in range(25):
                await asyncio.sleep(0.2)
                if not access_control._ACCESS_CACHE and not access_control._ROLES_CACHE:
                    cleared = True
                    break

            assert cleared, "Listener tidak membersihkan cache setelah NOTIFY dari koneksi lain"
        finally:
            listener.cancel()
            try:
                await listener
            except asyncio.CancelledError:
                pass

    asyncio.run(_run())


