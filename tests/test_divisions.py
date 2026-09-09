"""Pengujian Master Data Divisi, Konfigurasi Divisi pada User, dan Persona Divisi."""
import pytest
from database import (
    list_divisions,
    get_division,
    create_division,
    update_division,
    delete_division,
    get_division_impact,
    create_new_user,
    get_user_by_username,
    update_user_by_admin,
)


def test_seed_divisions_exist(db):
    """Memastikan migrasi men-seed divisi default (IT, IA, HR)."""
    divs = list_divisions()
    codes = {d["code"] for d in divs}
    assert "IT" in codes
    assert "IA" in codes
    assert "HR" in codes


def test_crud_division(db):
    """Pengujian operasi CRUD divisi secara terisolasi."""
    # 1. Create
    res = create_division(
        code="FIN",
        name="Finance & Accounting",
        description="Divisi Keuangan dan Akuntansi",
        persona="Anda adalah asisten khusus Finance.",
        rag_allowed_tags="ALL,FIN",
        enabled=True,
        sort_order=40,
    )
    assert res["success"] is True

    # Duplicate code should fail
    dup = create_division(code="FIN", name="Duplicate")
    assert dup["success"] is False

    # 2. Get
    div = get_division("FIN")
    assert div is not None
    assert div["name"] == "Finance & Accounting"
    assert div["persona"] == "Anda adalah asisten khusus Finance."
    assert div["rag_allowed_tags"] == "ALL,FIN"

    # 3. Update
    up = update_division("FIN", name="Finance, Tax & Accounting", persona="Persona Baru")
    assert up["success"] is True
    div_updated = get_division("FIN")
    assert div_updated["name"] == "Finance, Tax & Accounting"
    assert div_updated["persona"] == "Persona Baru"

    # 4. Delete
    d_res = delete_division("FIN")
    assert d_res["success"] is True
    assert get_division("FIN") is None


def test_user_division_assignment(db):
    """Pengujian penetapan divisi pada user saat create dan update."""
    uname = "user_div_test"
    # Buat user dengan divisi IT
    res = create_new_user(
        username=uname,
        password="Password123!",
        role="user",
        full_name="User Divisi Test",
        division_code="IT",
    )
    assert res["success"] is True

    u = get_user_by_username(uname)
    assert u["division_code"] == "IT"
    assert u["division_name"] == "Information Technology"

    # Periksa impact divisi IT
    impact = get_division_impact("IT")
    assert any(usr["username"] == uname for usr in impact["users"])

    # Update divisi user menjadi HR
    up = update_user_by_admin(
        username=uname,
        division_code="HR",
        update_division=True,
    )
    assert up["success"] is True
    u2 = get_user_by_username(uname)
    assert u2["division_code"] == "HR"
    assert u2["division_name"] == "Human Resources"

    # Clear division
    up_clear = update_user_by_admin(
        username=uname,
        division_code=None,
        update_division=True,
    )
    assert up_clear["success"] is True
    u3 = get_user_by_username(uname)
    assert u3["division_code"] is None


def test_admin_division_endpoints(client, admin_auth, make_user):
    """Pengujian endpoint REST API /api/admin/divisions dan /api/divisions."""
    # GET public active divisions
    user = make_user("regular_user_div")
    res_pub = client.get("/api/divisions", headers=user)
    assert res_pub.status_code == 200
    assert isinstance(res_pub.json(), list)

    # POST create division via admin
    res_create = client.post("/api/admin/divisions", json={
        "code": "MKT",
        "name": "Marketing & Sales",
        "description": "Divisi Pemasaran",
        "persona": "Asisten Marketing",
        "rag_allowed_tags": "ALL,MKT",
        "enabled": True,
        "sort_order": 50,
    }, headers=admin_auth)
    assert res_create.status_code == 200

    # Non-admin cannot create division
    res_forbidden = client.post("/api/admin/divisions", json={
        "code": "ILLEGAL",
        "name": "Illegal",
    }, headers=user)
    assert res_forbidden.status_code in (401, 403)

    # PUT update division via admin
    res_put = client.put("/api/admin/divisions/MKT", json={
        "name": "Commercial & Marketing",
    }, headers=admin_auth)
    assert res_put.status_code == 200

    # GET impact
    res_impact = client.get("/api/admin/divisions/MKT/impact", headers=admin_auth)
    assert res_impact.status_code == 200
    assert "user_count" in res_impact.json()

    # DELETE division via admin
    res_del = client.delete("/api/admin/divisions/MKT", headers=admin_auth)
    assert res_del.status_code == 200


def test_division_persona_prompt_injection(db, monkeypatch):
    """Memastikan Persona Divisi dan batasan RAG diinjeksikan ke dalam system prompt."""
    import asyncio
    import agent
    from models import ChatRequest

    captured = {}

    class FakeTool:
        name = "read_table"
        description = "d"
        inputSchema = {"type": "object", "properties": {}}

    class FakeLLM:
        def bind_tools(self, *args, **kwargs):
            return self

        async def ainvoke(self, messages):
            captured["prompt"] = messages[0].content

            class Response:
                content = "Jawaban."
                tool_calls = []

            return Response()

    async def fake_tools(server_filter="all"):
        return [{"server": "sap", "tool": FakeTool()}, {"server": "rag", "tool": FakeTool()}]

    monkeypatch.setattr(agent.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent, "ChatOpenAI", lambda **kwargs: FakeLLM())

    chat_req = ChatRequest(message="halo", server="sap:sandbox-new")
    asyncio.run(
        agent.process_chat(
            chat_req=chat_req,
            user_role="user",
            user_persona="Preferensi User Poin-Poin",
            username="test_div_agent",
            division_code="IA",
        )
    )

    prompt = captured.get("prompt", "")
    assert "KONTEKS & PERAN DIVISI: Internal Audit (IA)" in prompt
    assert "AFILIASI DIVISI PENGGUNA: Divisi Internal Audit (IA)" in prompt
    assert "Tag dokumen yang berhak diakses (berdasarkan divisi dan tingkat jabatan): [" in prompt
    assert "IA" in prompt
    assert "Preferensi User Poin-Poin" in prompt

