"""Pengujian Fitur Mode Chat (Fast, Medium, Expert, Custom) dan Matrix Hak Akses Per Role."""
import asyncio

import pytest
from database import (
    get_chat_modes,
    get_chat_mode_by_code,
    get_modes_for_role,
    get_role_modes,
    set_role_mode,
    update_system_config,
    get_system_config,
)


def test_default_modes_seeded(db):
    """Memastikan mode bawaan (fast, medium, expert) telah di-seed saat migrasi."""
    modes = get_chat_modes(enabled_only=False)
    codes = [m["code"] for m in modes]
    assert "fast" in codes
    assert "medium" in codes
    assert "expert" in codes

    fast = get_chat_mode_by_code("fast")
    assert fast is not None
    assert fast["max_iterations"] == 10
    assert fast["is_default"] is True


def test_user_modes_endpoint_guest_and_roles(client, make_user):
    """Endpoint /api/modes mengembalikan mode sesuai hak akses role."""
    # 1. Guest request (tanpa token)
    res_guest = client.get("/api/modes")
    assert res_guest.status_code == 200
    guest_modes = res_guest.json()["modes"]
    assert len(guest_modes) >= 3

    fast_guest = next((m for m in guest_modes if m["code"] == "fast"), None)
    assert fast_guest is not None
    assert fast_guest["available"] is True

    # 2. Standard user
    user_auth = make_user("user_mode_test", role="user")
    res_user = client.get("/api/modes", headers=user_auth)
    assert res_user.status_code == 200
    user_modes = res_user.json()["modes"]
    expert_user = next((m for m in user_modes if m["code"] == "expert"), None)
    # Default standard user role cannot access expert mode (restricted by default)
    if expert_user:
        assert expert_user["available"] is False


def test_admin_modes_crud(client, admin_auth):
    """Superadmin dapat melihat, menambah, mengubah, menjadikan default, dan menghapus mode."""
    # 1. Get modes
    res = client.get("/api/admin/modes", headers=admin_auth)
    assert res.status_code == 200
    data = res.json()
    assert "chat_modes_enabled" in data
    assert len(data["modes"]) >= 3

    # 2. Create custom mode
    payload = {
        "code": "audit_compliance",
        "name": "Audit & Compliance Mode",
        "description": "Deep audit checks with 30 max iterations",
        "icon": "search",
        "provider": "9router",
        "model": "ag/gemini-3.7-flash-medium",
        "fallback_provider": "openrouter",
        "fallback_model": "openrouter/free",
        "max_iterations": 30,
        "enabled": True,
        "is_default": False,
        "sort_order": 10,
    }
    create_res = client.post("/api/admin/modes", json=payload, headers=admin_auth)
    assert create_res.status_code == 200, create_res.text
    created = create_res.json()
    mode_id = created["id"]
    assert created["code"] == "audit_compliance"
    assert created["max_iterations"] == 30

    # 3. Update mode
    update_res = client.put(
        f"/api/admin/modes/{mode_id}",
        json={"name": "Audit Expert Pro", "max_iterations": 35},
        headers=admin_auth,
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Audit Expert Pro"
    assert update_res.json()["max_iterations"] == 35

    # 4. Set as default
    def_res = client.post(f"/api/admin/modes/{mode_id}/default", headers=admin_auth)
    assert def_res.status_code == 200
    check_mode = get_chat_mode_by_code("audit_compliance")
    assert check_mode["is_default"] is True

    # 5. Cannot delete default mode
    del_fail = client.delete(f"/api/admin/modes/{mode_id}", headers=admin_auth)
    assert del_fail.status_code == 400

    # Revert default to fast
    fast = get_chat_mode_by_code("fast")
    client.post(f"/api/admin/modes/{fast['id']}/default", headers=admin_auth)

    # 6. Delete custom mode
    del_ok = client.delete(f"/api/admin/modes/{mode_id}", headers=admin_auth)
    assert del_ok.status_code == 200
    assert get_chat_mode_by_code("audit_compliance") is None


def test_admin_role_matrix_endpoint(client, admin_auth, make_user):
    """Matrix hak akses per role dapat diambil dan diubah via API."""
    # 1. Get role matrix
    res = client.get("/api/admin/modes/roles", headers=admin_auth)
    assert res.status_code == 200
    matrix = res.json()["matrix"]
    assert isinstance(matrix, list)

    # 2. Grant functional access to expert mode
    update_matrix_res = client.put(
        "/api/admin/modes/roles",
        json={"role": "functional", "mode_code": "expert", "allowed": True},
        headers=admin_auth,
    )
    assert update_matrix_res.status_code == 200

    # 3. Verify via user endpoint
    func_auth = make_user("func_user_test", role="functional")
    user_modes_res = client.get("/api/modes", headers=func_auth)
    expert_m = next((m for m in user_modes_res.json()["modes"] if m["code"] == "expert"), None)
    assert expert_m is not None
    assert expert_m["available"] is True

    # 4. Revoke functional access to expert mode
    client.put(
        "/api/admin/modes/roles",
        json={"role": "functional", "mode_code": "expert", "allowed": False},
        headers=admin_auth,
    )
    user_modes_revoked = client.get("/api/modes", headers=func_auth)
    expert_revoked = next((m for m in user_modes_revoked.json()["modes"] if m["code"] == "expert"), None)
    assert expert_revoked["available"] is False


def test_admin_master_switch_toggle(client, admin_auth):
    """Toggle master switch chat_modes_enabled via endpoint."""
    res_disable = client.post(
        "/api/admin/modes/enabled",
        json={"enabled": False},
        headers=admin_auth,
    )
    assert res_disable.status_code == 200
    assert get_system_config().get("chat_modes_enabled") is False

    # Restore master switch
    res_enable = client.post(
        "/api/admin/modes/enabled",
        json={"enabled": True},
        headers=admin_auth,
    )
    assert res_enable.status_code == 200
    assert get_system_config().get("chat_modes_enabled") is True


def test_admin_reorder_modes(client, admin_auth):
    """Superadmin dapat mengubah urutan sort_order mode dan mempengaruhi endpoint user."""
    res = client.get("/api/admin/modes", headers=admin_auth)
    modes = res.json()["modes"]
    assert len(modes) >= 3

    original_ids = [m["id"] for m in modes]
    reversed_ids = list(reversed(original_ids))

    reorder_res = client.post(
        "/api/admin/modes/reorder",
        json={"mode_ids": reversed_ids},
        headers=admin_auth,
    )
    assert reorder_res.status_code == 200

    after_res = client.get("/api/admin/modes", headers=admin_auth)
    new_admin_ids = [m["id"] for m in after_res.json()["modes"]]
    assert new_admin_ids == reversed_ids

    user_res = client.get("/api/modes")
    new_user_ids = [m["id"] for m in user_res.json()["modes"]]
    assert new_user_ids == reversed_ids


# --------------------------------------------------------------------------
# Regresi: process_chat harus memakai UNION seluruh role, bukan role primer
# saja, saat memvalidasi mode yang diminta (bug lama: role kedua yang
# mengizinkan mode diabaikan karena hanya role_list[0] yang diperiksa).
# --------------------------------------------------------------------------

class _FakeModeModel:
    """Model tiruan minimal, cukup untuk melewati satu putaran process_chat."""

    def __init__(self):
        self.astream_dipanggil = 0

    async def astream(self, msgs):
        from langchain_core.messages import AIMessageChunk
        self.astream_dipanggil += 1
        yield AIMessageChunk(content="Jawaban singkat.", tool_calls=[])

    def bind_tools(self, tools, **kwargs):
        return self


def _jalankan_process_chat(monkeypatch, roles, mode_code):
    import agent as agent_module
    import database
    from models import ChatRequest

    model = _FakeModeModel()

    async def fake_tools(server_filter=None):
        return []

    monkeypatch.setattr(agent_module.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent_module, "ChatOpenAI", lambda **kw: model)
    monkeypatch.setattr(database, "get_system_config", lambda: {
        "nine_router_enabled": True,
        "nine_router_api_key": "kunci-uji",
        "nine_router_base_url": "http://contoh.invalid/v1",
        "nine_router_model": "model-uji",
        "openrouter_enabled": False,
        "chat_modes_enabled": True,
    })

    progres = []

    async def on_progress(**event):
        progres.append(event)

    hasil = asyncio.run(agent_module.process_chat(
        ChatRequest(message="stok material SRRPAI", mode=mode_code),
        roles,
        "",
        username="penguji_mode_union",
        on_progress=on_progress,
    ))
    return hasil, progres


def test_process_chat_mode_diizinkan_via_role_sekunder(db, monkeypatch):
    """User dengan roles=['frontend', 'backend']: 'expert' ditolak frontend
    tapi diizinkan backend -> harus TETAP aktif (union), bukan turun ke default."""
    # Sanity check data seed: frontend menolak expert, backend mengizinkan.
    frontend_modes = {m["code"]: m["available"] for m in get_modes_for_role("frontend")}
    backend_modes = {m["code"]: m["available"] for m in get_modes_for_role("backend")}
    assert frontend_modes.get("expert") is False
    assert backend_modes.get("expert") is True

    _, progres = _jalankan_process_chat(monkeypatch, ["frontend", "backend"], "expert")

    stages = [e.get("stage") for e in progres]
    assert "mode_downgraded" not in stages, (
        "Mode 'expert' seharusnya tetap aktif karena role 'backend' mengizinkannya, "
        f"tapi malah diturunkan. Progress events: {progres}"
    )


def test_process_chat_mode_ditolak_bila_semua_role_melarang(db, monkeypatch):
    """User dengan roles=['frontend'] saja: 'expert' ditolak -> harus turun ke default
    dan mengirim event mode_downgraded (bukan gagal diam-diam)."""
    _, progres = _jalankan_process_chat(monkeypatch, ["frontend"], "expert")

    stages = [e.get("stage") for e in progres]
    assert "mode_downgraded" in stages
