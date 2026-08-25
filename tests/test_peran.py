"""Peran abaper / functional / user dan hak ubah program.

Peran menentukan apakah tool MCP yang MENGUBAH objek SAP boleh dipakai.
Tool tersebut tidak sekadar disembunyikan dari prompt: definisinya tidak
dibuat sama sekali, sehingga model tidak punya cara memanggilnya walau
diminta pengguna.
"""
import asyncio

import pytest
from langchain_core.messages import AIMessageChunk

import agent as agent_module
from agent import tool_mengubah_program
from models import ChatRequest


class ModelPerekamTool:
    def __init__(self):
        self.tools = []

    def bind_tools(self, tools, **kwargs):
        self.tools = [t["function"]["name"] for t in tools]
        return self

    async def astream(self, msgs):
        yield AIMessageChunk(content="Baik.", tool_calls=[])

    async def ainvoke(self, msgs):
        return AIMessageChunk(content="Baik.", tool_calls=[])


NAMA_TOOL = [
    "read_table", "get_program", "search_object",     # baca
    "write_table", "create_program", "update_object", # ubah
    "delete_entry", "activate_object",
]


def _jalankan(monkeypatch, role):
    model = ModelPerekamTool()

    async def fake_tools(server_filter=None):
        return [
            {"server": "sap", "tool": type("T", (), {
                "name": n, "description": f"tool {n}", "inputSchema": {}})()}
            for n in NAMA_TOOL
        ]

    monkeypatch.setattr(agent_module.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent_module, "ChatOpenAI", lambda **kw: model)

    import database
    monkeypatch.setattr(database, "get_system_config", lambda: {
        "nine_router_enabled": True, "nine_router_api_key": "k",
        "nine_router_base_url": "http://x/v1", "nine_router_model": "m",
        "openrouter_enabled": False,
    })

    hasil = asyncio.run(agent_module.process_chat(
        ChatRequest(message="ubah program Z_TEST"), role, "", username="penguji",
    ))
    return model, hasil


@pytest.mark.parametrize("nama,mengubah", [
    ("read_table", False),
    ("get_program", False),
    ("search_object", False),
    ("write_table", True),
    ("create_program", True),
    ("update_object", True),
    ("delete_entry", True),
    ("activate_object", True),
])
def test_pengenalan_tool_pengubah(nama, mengubah):
    assert tool_mengubah_program(nama) is mengubah


def test_abaper_mendapat_seluruh_tool(monkeypatch, db):
    model, _ = _jalankan(monkeypatch, "abaper")
    assert len(model.tools) == len(NAMA_TOOL)
    assert any("write_table" in t for t in model.tools)


def test_functional_tidak_mendapat_tool_pengubah(monkeypatch, db):
    model, _ = _jalankan(monkeypatch, "functional")

    assert any("read_table" in t for t in model.tools), "tool baca ikut terbuang"
    for terlarang in ("write_table", "create_program", "update_object",
                      "delete_entry", "activate_object"):
        assert not any(terlarang in t for t in model.tools), (
            f"{terlarang} masih dapat dipanggil oleh peran functional"
        )


def test_user_biasa_juga_tidak_mendapat_tool_pengubah(monkeypatch, db):
    model, _ = _jalankan(monkeypatch, "user")
    assert not any("create_program" in t for t in model.tools)


def test_superadmin_mendapat_seluruh_tool(monkeypatch, db):
    model, _ = _jalankan(monkeypatch, "superadmin")
    assert len(model.tools) == len(NAMA_TOOL)


# --------------------------------------------------------------------------
# Pengelolaan peran lewat API admin
# --------------------------------------------------------------------------

@pytest.mark.parametrize("role", ["abaper", "functional", "user", "superadmin"])
def test_admin_dapat_membuat_pengguna_dengan_peran_baru(client, admin_auth, role):
    nama = f"peran_{role}"
    res = client.post("/api/admin/users", headers=admin_auth, json={
        "username": nama, "password": "Passw0rd123", "role": role,
    })
    assert res.status_code == 200, res.text
    daftar = client.get("/api/admin/users", headers=admin_auth).json()
    dibuat = next(u for u in daftar if u["username"].lower() == nama.lower())
    assert dibuat["role"] == role
    client.delete(f"/api/admin/users/{nama}", headers=admin_auth)


def test_peran_yang_tidak_dikenal_ditolak(client, admin_auth):
    res = client.post("/api/admin/users", headers=admin_auth, json={
        "username": "peran_aneh", "password": "Passw0rd123", "role": "raja",
    })
    assert res.status_code == 400
