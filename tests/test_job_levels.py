"""Pengujian Level Jabatan (Staff, Leader, Manager) dan Sinkronisasi Akses RAG Hirarkis."""
import asyncio
import pytest
import agent
from database import (
    compute_user_rag_tags,
    create_new_user,
    get_user_by_username,
    update_user_by_admin,
    authenticate_user,
    list_all_users,
)


def test_compute_user_rag_tags_hierarchy():
    """Memastikan pewarisan tag RAG sesuai level hirarkis (Staff, Leader, Manager)."""
    # 1. Staff: Hanya mendapatkan tag umum dan tag khusus staff
    staff_tags = compute_user_rag_tags(division_code="HR", job_level="staff", division_allowed_tags="ALL,HR")
    assert "ALL" in staff_tags
    assert "ALL:STAFF" in staff_tags
    assert "HR" in staff_tags
    assert "HR:STAFF" in staff_tags
    assert "HR:LEADER" not in staff_tags
    assert "HR:MANAGER" not in staff_tags

    # 2. Leader: Mendapatkan tag staff + leader
    leader_tags = compute_user_rag_tags(division_code="HR", job_level="leader", division_allowed_tags="ALL,HR")
    assert "ALL" in leader_tags
    assert "ALL:STAFF" in leader_tags
    assert "ALL:LEADER" in leader_tags
    assert "HR:STAFF" in leader_tags
    assert "HR:LEADER" in leader_tags
    assert "HR:MANAGER" not in leader_tags

    # 3. Manager: Mendapatkan semua tag staff + leader + manager (full clearance)
    mgr_tags = compute_user_rag_tags(division_code="HR", job_level="manager", division_allowed_tags="ALL,HR")
    assert "ALL" in mgr_tags
    assert "ALL:STAFF" in mgr_tags
    assert "ALL:LEADER" in mgr_tags
    assert "ALL:MANAGER" in mgr_tags
    assert "HR:STAFF" in mgr_tags
    assert "HR:LEADER" in mgr_tags
    assert "HR:MANAGER" in mgr_tags

    # 4. Fallback jika level tidak valid / tidak diberikan -> default ke staff
    fallback_tags = compute_user_rag_tags(division_code="IT", job_level="invalid_role", division_allowed_tags="ALL,IT")
    assert "IT:STAFF" in fallback_tags
    assert "IT:LEADER" not in fallback_tags
    assert "IT:MANAGER" not in fallback_tags

    # 5. Tanpa divisi (lintas divisi / umum)
    nodiv_tags = compute_user_rag_tags(division_code=None, job_level="leader", division_allowed_tags=None)
    assert "ALL" in nodiv_tags
    assert "ALL:STAFF" in nodiv_tags
    assert "ALL:LEADER" in nodiv_tags
    assert "ALL:MANAGER" not in nodiv_tags


def test_user_job_level_crud(db):
    """Memastikan CRUD user menyimpan dan memperbarui job_level dengan benar."""
    uname = "user_jl_test"
    # Create user dengan job_level leader
    res = create_new_user(
        username=uname,
        password="Password123!",
        role="user",
        full_name="User Leader Test",
        division_code="IT",
        job_level="leader",
    )
    assert res["success"] is True

    # Get by username
    u = get_user_by_username(uname)
    assert u is not None
    assert u["job_level"] == "leader"
    assert u["division_code"] == "IT"

    # Authenticate user
    auth = authenticate_user(uname, "Password123!")
    assert auth is not None
    assert auth["job_level"] == "leader"

    # List all users
    all_users = list_all_users()
    found = next((usr for usr in all_users if usr["username"] == uname), None)
    assert found is not None
    assert found["job_level"] == "leader"

    # Update job level to manager
    up = update_user_by_admin(
        username=uname,
        job_level="manager",
        update_job_level=True,
    )
    assert up["success"] is True
    u_up = get_user_by_username(uname)
    assert u_up["job_level"] == "manager"

    # Buat user tanpa menentukan job_level -> default "staff"
    uname_default = "user_jl_default"
    res2 = create_new_user(
        username=uname_default,
        password="Password123!",
        role="user",
    )
    assert res2["success"] is True
    u_def = get_user_by_username(uname_default)
    assert u_def["job_level"] == "staff"


def test_api_admin_users_and_login_job_level(client, admin_auth):
    """Pengujian endpoint API /api/admin/users dan /api/login terhadap job_level."""
    uname = "api_jl_user"
    # Create via admin API
    resp = client.post(
        "/api/admin/users",
        json={
            "username": uname,
            "password": "Password123!",
            "full_name": "API JL User",
            "role": "user",
            "division_code": "HR",
            "job_level": "leader",
        },
        headers=admin_auth,
    )
    assert resp.status_code == 200

    # Login dengan user baru dan cek response login
    login_resp = client.post(
        "/api/login",
        json={"username": uname, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert data["job_level"] == "leader"
    assert data["division_code"] == "HR"

    # Update job level via admin API
    update_resp = client.put(
        f"/api/admin/users/{uname}",
        json={
            "job_level": "manager",
        },
        headers=admin_auth,
    )
    assert update_resp.status_code == 200

    # Verify updated level via /api/me using token
    user_token = data["access_token"]
    me_resp = client.get("/api/me", headers={"Authorization": f"Bearer {user_token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["job_level"] == "manager"


def test_agent_job_level_persona_injection(monkeypatch):
    """Memastikan instruksi persona job level diinjeksikan ke dalam system prompt agen."""
    from agent import ChatRequest

    captured = {}

    class FakeTool:
        name = "test_tool"
        description = "Deskripsi test."
        inputSchema = {"type": "object", "properties": {}}

    class FakeLLM:
        def bind_tools(self, *args, **kwargs):
            return self

        async def ainvoke(self, messages):
            captured["prompt"] = messages[0].content

            class Response:
                content = "Jawaban mock."
                tool_calls = []

            return Response()

    async def fake_tools(server_filter="all"):
        return [{"server": "sap", "tool": FakeTool()}, {"server": "rag", "tool": FakeTool()}]

    monkeypatch.setattr(agent.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent, "ChatOpenAI", lambda **kwargs: FakeLLM())

    chat_req = ChatRequest(message="Bagaimana cara approval PO?", server="sap:sandbox-new")

    # 1. Panggil dengan level 'leader' dan divisi 'HR'
    asyncio.run(
        agent.process_chat(
            chat_req=chat_req,
            user_role="user",
            user_persona="Preferensi Pribadi",
            username="test_jl_agent",
            division_code="HR",
            job_level="leader",
        )
    )

    prompt = captured.get("prompt", "")
    assert "TINGKAT JABATAN PENGGUNA: LEADER" in prompt
    assert "AFILIASI DIVISI PENGGUNA: Divisi Human Resources (HR)" in prompt
    assert "PANDUAN PERSONA TINGKAT JABATAN:" in prompt
    assert "KEBIJAKAN AKSES DOKUMEN / RAG:" in prompt
    assert "HR:LEADER" in prompt

    # 2. Panggil dengan level 'manager'
    captured.clear()
    asyncio.run(
        agent.process_chat(
            chat_req=chat_req,
            user_role="user",
            user_persona="Preferensi Pribadi",
            username="test_jl_agent",
            division_code="HR",
            job_level="manager",
        )
    )
    prompt_mgr = captured.get("prompt", "")
    assert "TINGKAT JABATAN PENGGUNA: MANAGER" in prompt_mgr
    assert "HR:MANAGER" in prompt_mgr
