"""Pengujian Fitur Mode Chat (Fast, Medium, Expert, Custom) dan Matrix Hak Akses Per Role."""
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
