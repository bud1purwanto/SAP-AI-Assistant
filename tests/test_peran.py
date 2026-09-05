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
from agent import rfc_mengubah_data, teks_sql_mengubah_data, tool_mengubah_program
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


# Tool BACA yang kebetulan memuat pola pengubah sebagai bagian dari kata lain.
# Pencocokan substring polos sebelumnya menolak semuanya, sehingga permintaan
# analisis read-only untuk peran functional/user ikut ditolak — persis
# keluhan yang memulai perbaikan ini.
@pytest.mark.parametrize("nama", [
    "get_commitment_report",     # commit ⊂ commitment
    "read_updates_log",          # update ⊂ updates
    "get_last_updated_docs",     # update ⊂ updated
    "search_exchange_rate",      # change ⊂ exchange
    "read_deleted_flag_status",  # delete ⊂ deleted
    "read_committed_stock",      # commit ⊂ committed
    "get_exchange_history",      # change ⊂ exchange
    "read_updated_master_data",  # update ⊂ updated
    "get_activation_status",     # activate ⊂ activation (dites juga, bukan substring)
    "execute_query",             # "execute" saja, bukan frasa "execute_abap"
    "run_report",                # "run" saja, bukan frasa "run_abap"
])
def test_tool_baca_yang_mirip_kata_pengubah_tidak_ditolak(nama):
    assert tool_mengubah_program(nama) is False


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


# --------------------------------------------------------------------------
# Jalur SQL: sebelumnya hanya diperiksa lewat konektor (boleh/tidak boleh
# pakai SQL sama sekali), tanpa pembeda baca/tulis — begitu konektor SQL
# diizinkan, tool yang menulis pun ikut lolos.
# --------------------------------------------------------------------------

@pytest.mark.parametrize("nama,mengubah", [
    ("sql_query", False),
    ("sql_execute", False),
    ("sql_run_query", False),
    # Tool navigasi/sesi — bukan operasi data, tidak boleh ikut tertolak
    # hanya karena namanya memuat "set".
    ("sql_set_active_server", False),
    ("sql_list_servers", False),
    ("sql_insert_row", True),
    ("sql_update_row", True),
    ("sql_delete_row", True),
])
def test_pengenalan_tool_sql_pengubah(nama, mengubah):
    assert tool_mengubah_program(nama) is mengubah


@pytest.mark.parametrize("query,mengubah", [
    ("SELECT * FROM MARA WHERE MATNR = 'X'", False),
    ("  select count(*) from vbak", False),
    ("WITH cte AS (SELECT 1) SELECT * FROM cte", False),
    ("UPDATE zmytable SET flag = 1", True),
    ("insert into log_table values (1,2,3)", True),
    ("DELETE FROM users WHERE id = 5", True),
    ("DROP TABLE users", True),
    ("EXEC sp_do_something", True),
    # Pernyataan kedua tidak boleh lolos hanya karena yang pertama SELECT.
    ("SELECT 1; DROP TABLE users;", True),
    # Tulis yang diselundupkan lewat CTE, bukan sebagai kata pertama.
    ("WITH src AS (SELECT id FROM staging) INSERT INTO target SELECT * FROM src", True),
    ("", False),
])
def test_pengenalan_teks_sql_pengubah(query, mengubah):
    assert teks_sql_mengubah_data(query) is mengubah


def _jalankan_sql(monkeypatch, role):
    model = ModelPerekamTool()
    nama_tool_sql = ["sql_query", "sql_set_active_server", "sql_insert_row"]

    async def fake_tools(server_filter=None):
        return [
            {"server": "sql", "tool": type("T", (), {
                "name": n, "description": f"tool {n}", "inputSchema": {}})()}
            for n in nama_tool_sql
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
        ChatRequest(message="tampilkan data", active_server="sql"), role, "", username="penguji",
    ))
    return model, hasil


def test_functional_tetap_bisa_query_sql_tapi_tidak_menulis(monkeypatch, db):
    model, _ = _jalankan_sql(monkeypatch, "functional")
    assert any("sql_query" in t for t in model.tools), "tool baca SQL ikut terbuang"
    assert any("sql_set_active_server" in t for t in model.tools), "tool navigasi SQL ikut terbuang"
    assert not any("sql_insert_row" in t for t in model.tools), (
        "tool tulis SQL masih dapat dipanggil oleh peran functional"
    )


def test_abaper_mendapat_seluruh_tool_sql(monkeypatch, db):
    model, _ = _jalankan_sql(monkeypatch, "abaper")
    assert any("sql_insert_row" in t for t in model.tools)


# --------------------------------------------------------------------------
# Function module RFC/BAPI
#
# Tool gerbang RFC ("call_function") tetap tersedia untuk peran read-only —
# mayoritas pembacaan SAP justru lewat situ. Yang menentukan boleh atau
# tidaknya adalah NAMA function module yang dipanggil.
# --------------------------------------------------------------------------

def test_gerbang_rfc_tetap_tersedia_untuk_peran_baca():
    """call_function tidak boleh ikut disembunyikan: RFC_READ_TABLE dan
    BAPI_*_GETDETAIL dipanggil lewat tool ini."""
    assert tool_mengubah_program("call_function") is False


@pytest.mark.parametrize("fm", [
    "BAPI_SALESORDER_CREATEFROMDAT2",  # kata kerja dirangkai, bukan kata utuh
    "BAPI_GOODSMVT_CREATE",
    "BAPI_PO_CHANGE",
    "BAPI_MATERIAL_SAVEDATA",
    "BAPI_PO_RELEASE",
    "BAPI_BILLINGDOC_CANCEL",
    "BAPI_TRANSACTION_COMMIT",
    # Penulis yang TIDAK berawalan BAPI_ — seluruhnya lolos pada
    # pemeriksaan lama yang hanya mengenali awalan "BAPI_".
    "SD_SALESDOCUMENT_CREATE",
    "Z_POST_GOODS_MOVEMENT",
    "BDC_INSERT",
    "RV_ORDER_POST",
])
def test_rfc_penulis_dikenali(fm):
    assert rfc_mengubah_data(fm) is True


@pytest.mark.parametrize("fm", [
    "RFC_READ_TABLE",
    "RFC_GET_TABLE_ENTRIES",
    "BAPI_MATERIAL_GET_DETAIL",
    "BAPI_MATERIAL_GETLIST",
    "BAPI_COMPANYCODE_GETLIST",
    "Z_DISPLAY_STOCK",
    "BAPI_SALESORDER_SIMULATE",
    # Membaca RIWAYAT perubahan, bukan mengubah — kata kerja baca pada
    # token terakhir harus menang atas "CHANGE" di token sebelumnya.
    "CHANGEDOCUMENT_READ",
    "BAPI_CHANGEDOCUMENT_GETDETAIL",
    "",
])
def test_rfc_pembaca_tidak_ditolak(fm):
    assert rfc_mengubah_data(fm) is False


# --------------------------------------------------------------------------
# Penjagaan hak tulis harus jalan MESKI master switch access control mati.
#
# Sebelumnya pemeriksaan ini bersarang di dalam blok
# `if access_control.is_access_control_enabled():`, sedangkan nilai bawaan
# master switch itu False. Akibatnya can_write_res tetap True dan tidak ada
# satu pun pemeriksaan yang berjalan — peran read-only bisa menjalankan BAPI
# transaksi lewat gerbang call_function.
# --------------------------------------------------------------------------

class ModelPemanggilRFC:
    """Model tiruan yang memaksa satu panggilan call_function, lalu menjawab."""

    def __init__(self, function_name):
        self.function_name = function_name
        self.sudah_memanggil = False

    def bind_tools(self, tools, **kwargs):
        return self

    async def ainvoke(self, msgs):
        if not self.sudah_memanggil:
            self.sudah_memanggil = True
            return AIMessageChunk(content="", tool_calls=[{
                "name": "sap__call_function",
                "args": {"function_name": self.function_name},
                "id": "panggilan-1",
            }])
        return AIMessageChunk(content="Selesai.", tool_calls=[])

    async def astream(self, msgs):
        yield await self.ainvoke(msgs)


def _jalankan_rfc(monkeypatch, role, function_name):
    """Jalankan process_chat dengan access control MATI, catat apakah
    panggilan MCP benar-benar diteruskan ke server SAP."""
    model = ModelPemanggilRFC(function_name)
    dipanggil = []

    async def fake_tools(server_filter=None, allowed_connectors=None):
        return [
            {"server": "sap", "tool": type("T", (), {
                "name": "call_function",
                "description": "Panggil function module RFC",
                "inputSchema": {}})()}
        ]

    async def fake_call_tool(server, nama, args, **kwargs):
        dipanggil.append((server, nama, args))
        class R:
            is_error = False
            content = []
        return R()

    monkeypatch.setattr(agent_module.mcp_manager, "get_all_tools", fake_tools)
    monkeypatch.setattr(agent_module.mcp_manager, "call_tool", fake_call_tool)
    monkeypatch.setattr(agent_module, "ChatOpenAI", lambda **kw: model)

    import access_control
    # Inti pengujian: master switch MATI.
    monkeypatch.setattr(access_control, "is_access_control_enabled", lambda: False)

    import database
    monkeypatch.setattr(database, "get_system_config", lambda: {
        "nine_router_enabled": True, "nine_router_api_key": "k",
        "nine_router_base_url": "http://x/v1", "nine_router_model": "m",
        "openrouter_enabled": False,
    })

    asyncio.run(agent_module.process_chat(
        ChatRequest(message="jalankan transaksi"), role, "", username="penguji",
    ))
    return dipanggil


def test_functional_tidak_bisa_rfc_transaksi_walau_access_control_mati(monkeypatch, db):
    dipanggil = _jalankan_rfc(monkeypatch, "functional", "BAPI_SALESORDER_CREATEFROMDAT2")
    assert dipanggil == [], (
        "peran read-only berhasil menjalankan BAPI transaksi ketika master "
        "switch access control mati"
    )


def test_functional_tidak_bisa_rfc_penulis_non_bapi(monkeypatch, db):
    """Penulis yang tidak berawalan BAPI_ juga harus tertahan."""
    dipanggil = _jalankan_rfc(monkeypatch, "functional", "Z_POST_GOODS_MOVEMENT")
    assert dipanggil == []


def test_functional_tetap_bisa_rfc_baca(monkeypatch, db):
    """Yang dijaga hanya yang menulis — pembacaan harus tetap jalan."""
    dipanggil = _jalankan_rfc(monkeypatch, "functional", "RFC_READ_TABLE")
    assert len(dipanggil) == 1, "RFC baca ikut tertahan"
    assert dipanggil[0][1] == "call_function"


def test_abaper_tetap_bisa_rfc_transaksi(monkeypatch, db):
    dipanggil = _jalankan_rfc(monkeypatch, "abaper", "BAPI_SALESORDER_CREATEFROMDAT2")
    assert len(dipanggil) == 1, "peran abaper justru ikut tertahan"
