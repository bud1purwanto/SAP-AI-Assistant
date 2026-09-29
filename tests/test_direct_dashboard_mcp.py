import pytest
import time
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_check_servers_status_from_dashboard_mcp():
    """Verifikasi check_servers_status menggunakan dashboard-mcp sebagai sumber otoritatif."""
    from mcp_manager import mcp_manager

    mock_payload = {
        "resources": [
            {
                "resource_key": "sap:dev-aix",
                "kind": "sap",
                "label": "SAP Development AIX",
                "sid": "DEV",
                "client": "130",
                "is_production": False,
            },
            {
                "resource_key": "service:rag",
                "kind": "service",
                "label": "Manufacturing RAG",
                "is_production": False,
            },
        ],
        "status": {
            "sap": {"online": True, "status": "online", "tool_count": 5},
            "rag": {"online": True, "status": "online", "tool_count": 3},
            "sql": {"online": False, "status": "offline", "tool_count": 0},
            "email": {"online": True, "status": "online", "tool_count": 2},
            "jira": {"online": True, "status": "online", "tool_count": 4, "name": "Jira Gateway"},
        },
    }

    with patch.object(mcp_manager, "_fetch_dashboard_resources", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_payload
        # Reset cache time to force fetch
        mcp_manager._resources_cache_time = 0.0
        mcp_manager._resources_cache = []

        status = await mcp_manager.check_servers_status()

        # 1. SAP verification
        assert "sap" in status
        assert status["sap"]["online"] is True
        assert status["sap"]["status"] == "online"
        assert status["sap"]["tool_count"] == 5
        assert len(status["sap"]["sub_servers"]) >= 1
        assert status["sap"]["sub_servers"][0]["name"] == "SAP Development AIX"
        assert status["sap"]["sub_servers"][0]["client"] == "130"
        assert status["sap"]["sub_servers"][0]["sid"] == "DEV"

        # 2. RAG & Email verification
        assert "rag" in status
        assert status["rag"]["online"] is True
        assert status["rag"]["tool_count"] == 3
        assert "email" in status
        assert status["email"]["online"] is True
        assert status["email"]["tool_count"] == 2

        # 3. Custom server (jira) verification
        assert "jira" in status
        assert status["jira"]["online"] is True
        assert status["jira"]["tool_count"] == 4
        assert status["jira"]["name"] == "Jira Gateway"

        # 4. get_live_resources
        resources = await mcp_manager.get_live_resources()
        assert len(resources) == 2
        assert any(r["resource_key"] == "sap:dev-aix" for r in resources)


@pytest.mark.asyncio
async def test_get_live_resources_caching():
    """Verifikasi get_live_resources dan TTL caching."""
    from mcp_manager import mcp_manager

    mock_payload = {
        "resources": [
            {
                "resource_key": "sap:prd-aix",
                "kind": "sap",
                "label": "SAP Production AIX",
                "sid": "PRD",
                "client": "999",
                "is_production": True,
            }
        ],
        "status": {"sap": {"online": True, "status": "online", "tool_count": 8}},
    }

    with patch.object(mcp_manager, "_fetch_dashboard_resources", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = mock_payload
        mcp_manager._resources_cache_time = 0.0
        mcp_manager._resources_cache = []

        # Panggilan pertama - harus fetch
        res1 = await mcp_manager.get_live_resources()
        assert len(res1) == 1
        assert res1[0]["resource_key"] == "sap:prd-aix"
        assert mock_fetch.call_count == 1

        # Panggilan kedua - masih dalam TTL, tidak boleh fetch ulang
        res2 = await mcp_manager.get_live_resources()
        assert len(res2) == 1
        assert mock_fetch.call_count == 1

        # Panggilan ketiga dengan force_refresh=True - harus fetch ulang
        res3 = await mcp_manager.get_live_resources(force_refresh=True)
        assert len(res3) == 1
        assert mock_fetch.call_count == 2


def test_get_live_resources_sync():
    """Verifikasi get_live_resources_sync mengembalikan cache atau fallback aman."""
    from mcp_manager import mcp_manager

    # Set cache
    mcp_manager._resources_cache = [
        {"resource_key": "service:rag", "kind": "service", "label": "RAG"}
    ]
    mcp_manager._resources_cache_time = time.time()

    res = mcp_manager.get_live_resources_sync()
    assert len(res) == 1
    assert res[0]["resource_key"] == "service:rag"


@pytest.mark.asyncio
async def test_check_servers_status_fallback_when_dashboard_unreachable():
    """Verifikasi fallback aman saat dashboard-mcp tidak dapat dihubungi."""
    from mcp_manager import mcp_manager

    with patch.object(mcp_manager, "_fetch_dashboard_resources", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = None
        mcp_manager._resources_cache_time = 0.0
        mcp_manager._resources_cache = []

        status = await mcp_manager.check_servers_status()

        # Sistem server harus ada dan berstatus offline tanpa melempar exception
        assert "sap" in status
        assert status["sap"]["online"] is False
        assert status["sap"]["status"] == "offline"
        assert status["sap"]["tool_count"] == 0
        assert status["sap"]["sub_servers"] == []

        assert "rag" in status
        assert status["rag"]["online"] is False
        assert status["rag"]["status"] == "offline"

        assert "sql" in status
        assert status["sql"]["online"] is False
        assert status["sql"]["status"] == "offline"

        assert "email" in status
        assert status["email"]["online"] is False
        assert status["email"]["status"] == "offline"


@pytest.mark.asyncio
async def test_no_database_mcp_servers_calls():
    """Verifikasi bahwa check_servers_status TIDAK memanggil database.list_mcp_servers."""
    from mcp_manager import mcp_manager

    with patch.object(mcp_manager, "_fetch_dashboard_resources", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = {
            "resources": [],
            "status": {"sap": {"online": True, "status": "online", "tool_count": 0}},
        }

        # Mock database.list_mcp_servers jika ada di sys.modules
        mock_list_servers = MagicMock()
        with patch.dict("sys.modules", {"database": MagicMock(list_mcp_servers=mock_list_servers)}):
            await mcp_manager.check_servers_status()
            assert mock_list_servers.call_count == 0


def test_access_control_get_all_resources_uses_live_resources(monkeypatch):
    """Verifikasi get_all_resources mengambil data dari mcp_manager dan formatnya terstandarisasi."""
    import access_control
    from mcp_manager import mcp_manager
    import database

    mock_live = [
        {
            "resource_key": "service:custom-jira",
            "kind": "service",
            "label": "Custom Jira Gateway",
            "is_production": True,
        },
        {
            "resource_key": "sap:test-aix",
            "kind": "sap",
            "label": "Test AIX",
            "sid": "TST",
            "client": "100",
            "is_production": False,
        },
    ]

    monkeypatch.setattr(mcp_manager, "get_live_resources_sync", lambda force_refresh=False: mock_live)

    class FailIfMcpResourcesEngine:
        def connect(self):
            class FailConn:
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
                def execute(self, q, *args, **kwargs):
                    if "mcp_resources" in str(q).lower():
                        raise AssertionError("Query mcp_resources tidak boleh dijalankan!")
                    return MagicMock(fetchall=lambda: [])
            return FailConn()

    monkeypatch.setattr(database, "get_engine", lambda: FailIfMcpResourcesEngine())

    resources = access_control.get_all_resources()

    # Periksa standarisasi dictionary format
    assert len(resources) == 2
    # Diurutkan berdasarkan kind ASC, is_production ASC, resource_key ASC -> sap duluan, baru service
    assert resources[0]["resource_key"] == "sap:test-aix"
    assert resources[0]["kind"] == "sap"
    assert resources[0]["sid"] == "TST"
    assert resources[0]["client"] == "100"
    assert resources[0]["is_production"] is False
    assert resources[0]["archived"] is False
    assert "first_seen_at" in resources[0]
    assert "last_seen_at" in resources[0]

    assert resources[1]["resource_key"] == "service:custom-jira"
    assert resources[1]["kind"] == "service"
    assert resources[1]["is_production"] is True


def test_access_control_get_all_resources_fallback_when_empty(monkeypatch):
    """Verifikasi fallback aman ke standard resources saat mcp_manager mengembalikan list kosong."""
    import access_control
    from mcp_manager import mcp_manager

    monkeypatch.setattr(mcp_manager, "get_live_resources_sync", lambda force_refresh=False: [])

    resources = access_control.get_all_resources()
    res_keys = [r["resource_key"] for r in resources]
    assert "sap:dev-aix" in res_keys
    assert "sap:prod-aix" in res_keys
    assert "service:rag" in res_keys
    assert "service:email" in res_keys


def test_access_control_get_all_roles_matrix_uses_live_resources(monkeypatch):
    """Verifikasi get_all_roles_matrix membangun matriks berbasis live resources."""
    import access_control
    from mcp_manager import mcp_manager
    import database

    mock_live = [
        {"resource_key": "sap:test-aix", "kind": "sap", "label": "Test AIX", "is_production": False},
        {"resource_key": "service:rag", "kind": "service", "label": "RAG", "is_production": False},
    ]
    monkeypatch.setattr(mcp_manager, "get_live_resources_sync", lambda force_refresh=False: mock_live)
    monkeypatch.setattr(database, "get_roles", lambda enabled_only=False: [{"code": "abaper"}, {"code": "functional"}])

    class MockConn:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def execute(self, q, *args, **kwargs):
            q_str = str(q).lower()
            if "mcp_resources" in q_str:
                raise AssertionError("Query mcp_resources tidak boleh dijalankan!")
            if "role_resource_access" in q_str:
                return MagicMock(fetchall=lambda: [("abaper", "sap:test-aix", True, True)])
            return MagicMock(fetchall=lambda: [])

    class MockEngine:
        def connect(self):
            return MockConn()

    monkeypatch.setattr(database, "get_engine", lambda: MockEngine())

    matrix_data = access_control.get_all_roles_matrix()
    assert "resources" in matrix_data
    res_keys = [r["resource_key"] for r in matrix_data["resources"]]
    assert "sap:test-aix" in res_keys
    assert "service:rag" in res_keys

    matrix = matrix_data["matrix"]
    assert "abaper" in matrix
    assert matrix["abaper"]["sap:test-aix"]["allowed"] is True
    assert matrix["abaper"]["sap:test-aix"]["can_write"] is True


def test_access_control_load_aliases_from_db_uses_get_all_resources(monkeypatch):
    """Verifikasi load_aliases_from_db mempopulasikan alias dari get_all_resources tanpa query tabel mcp_resources."""
    import access_control
    import database

    class FailEngine:
        def connect(self):
            class FailConn:
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
                def execute(self, q, *args, **kwargs):
                    if "mcp_resources" in str(q).lower():
                        raise AssertionError("Query mcp_resources tidak boleh dijalankan!")
                    return MagicMock(fetchall=lambda: [])
            return FailConn()

    monkeypatch.setattr(database, "get_engine", lambda: FailEngine())

    mock_resources = [
        {
            "resource_key": "sap:sandbox-prd",
            "kind": "sap",
            "label": "Sandbox Production (PRD)",
            "sid": "PRD",
            "client": "100",
            "is_production": True,
            "archived": False,
        },
        {
            "resource_key": "sql:warehouse",
            "kind": "sql",
            "label": "Data Warehouse",
            "sid": "",
            "client": "",
            "is_production": False,
            "archived": False,
        },
    ]

    monkeypatch.setattr(access_control, "get_all_resources", lambda include_archived=False: mock_resources)

    access_control.load_aliases_from_db(force_refresh=True)

    assert access_control.canonical_resource_key("sandbox-prd") == "sap:sandbox-prd"
    assert access_control.canonical_resource_key("prd") == "sap:sandbox-prd"
    assert access_control.canonical_resource_key("warehouse") == "sql:warehouse"


def test_access_control_sync_resources_from_mcp_no_db_write(monkeypatch):
    """Verifikasi sync_resources_from_mcp mendaftarkan alias in-memory tanpa query write ke DB."""
    import access_control
    import database

    class FailEngine:
        def begin(self):
            raise AssertionError("Database write tidak boleh dijalankan oleh sync_resources_from_mcp!")
        def connect(self):
            raise AssertionError("Database connect tidak boleh dijalankan oleh sync_resources_from_mcp!")

    monkeypatch.setattr(database, "get_engine", lambda: FailEngine())

    status_dict = {
        "sap": {
            "online": True,
            "sub_servers": [
                {"name": "Production AIX", "aliases": ["prod-aix", "trp"], "sid": "TRP"},
            ],
        },
        "sql": {
            "online": True,
            "sub_servers": [
                {"name": "analytics-db", "aliases": ["analytics"]},
            ],
        },
        "jira": {
            "online": True,
            "name": "Jira Gateway",
        },
    }

    keys = access_control.sync_resources_from_mcp(status_dict)
    assert "service:rag" in keys
    assert "service:email" in keys
    assert any("sap:" in k for k in keys)
    assert any("sql:" in k for k in keys)
    assert "service:jira" in keys

    # Cek alias terdaftar di in-memory map
    assert access_control.canonical_resource_key("trp") == "sap:prod-aix"
    assert access_control.canonical_resource_key("analytics-db") == "sql:analytics-db"


def test_access_control_get_user_matrix_uses_live_resources(monkeypatch):
    """Verifikasi get_user_matrix membangun matriks user berbasis live resources."""
    import access_control
    import database

    mock_resources = [
        {
            "resource_key": "sap:test-aix",
            "kind": "sap",
            "label": "Test AIX",
            "sid": "TST",
            "client": "100",
            "is_production": False,
            "archived": False,
        },
        {
            "resource_key": "service:rag",
            "kind": "service",
            "label": "RAG Knowledge",
            "is_production": False,
            "archived": False,
        },
    ]
    monkeypatch.setattr(access_control, "get_all_resources", lambda include_archived=False: mock_resources)
    monkeypatch.setattr(access_control, "effective_roles", lambda username, is_guest=False, token_roles=None: ["abaper"])
    monkeypatch.setattr(database, "get_user_by_username", lambda u: {"username": u, "role": "abaper", "roles": ["abaper"]})
    class MockConn:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def execute(self, q, *args, **kwargs):
            q_str = str(q).lower()
            if "role_resource_access" in q_str:
                # abaper role allowed on sap:test-aix
                return MagicMock(fetchall=lambda: [("sap:test-aix", True, True)])
            if "user_resource_access" in q_str:
                return MagicMock(fetchall=lambda: [])
            return MagicMock(fetchall=lambda: [])

    class MockEngine:
        def connect(self):
            return MockConn()

    monkeypatch.setattr(database, "get_engine", lambda: MockEngine())

    user_matrix = access_control.get_user_matrix("testuser")
    assert "resources" in user_matrix
    res_keys = [r["resource_key"] for r in user_matrix["resources"]]
    assert "sap:test-aix" in res_keys
    assert "service:rag" in res_keys
    assert user_matrix["username"] == "testuser"
    assert user_matrix["role"] == "abaper"
    assert user_matrix["roles"] == ["abaper"]
    sap_item = next(r for r in user_matrix["resources"] if r["resource_key"] == "sap:test-aix")
    assert sap_item["effective_allowed"] is True


@pytest.mark.asyncio
async def test_admin_stats_uses_live_mcp_status(monkeypatch):
    import main

    live = {"jira": {"id": "jira", "name": "Jira", "online": True, "status": "online", "tool_count": 4}}
    monkeypatch.setattr(main, "get_admin_system_stats", lambda **kwargs: {})
    monkeypatch.setattr(main.mcp_manager, "check_servers_status", AsyncMock(return_value=live))
    import database
    monkeypatch.setattr(database, "list_mcp_servers", lambda **kwargs: (_ for _ in ()).throw(AssertionError("local MCP table used")))
    result = await main.get_admin_stats_endpoint(admin={"username": "admin"})
    assert result["mcp_servers"] == [live["jira"]]


@pytest.mark.asyncio
async def test_admin_mcp_servers_returns_live_status(monkeypatch):
    import main

    live = {"sap": {"id": "sap", "name": "SAP", "online": True}}
    monkeypatch.setattr(main.mcp_manager, "check_servers_status", AsyncMock(return_value=live))

    assert await main.get_admin_mcp_servers_endpoint(admin={"username": "admin"}) == {"servers": [live["sap"]]}


@pytest.mark.asyncio
async def test_admin_resource_sync_forces_live_refresh(monkeypatch):
    import main

    refresh = AsyncMock(return_value=[{"resource_key": "sap:dev-aix"}])
    monkeypatch.setattr(main.mcp_manager, "get_live_resources", refresh)
    monkeypatch.setattr(main.mcp_manager, "check_servers_status", AsyncMock(return_value={"sap": {"online": True}}))
    monkeypatch.setattr(main.access_control, "sync_resources_from_mcp", lambda status: ["sap:dev-aix"])
    monkeypatch.setattr(main.access_control, "get_all_resources", lambda include_archived=False: [{"resource_key": "sap:dev-aix"}])

    result = await main.sync_admin_access_resources_endpoint(admin={"username": "admin"})
    refresh.assert_awaited_once_with(force_refresh=True)
    assert result["synced_keys"] == ["sap:dev-aix"]

def test_mcp_manager_get_client_token_resolution(monkeypatch):
    """Verifikasi get_client menggunakan dashboard token dari contextvar atau fallback settings."""
    from mcp_manager import mcp_manager
    from auth import set_dashboard_access_token
    from config import settings

    monkeypatch.setattr(settings, "dashboard_mcp_gateway_url", "http://192.168.1.161:4000/v1/gateway")

    # 1. Saat contextvar berisi token, gunakan token tersebut
    set_dashboard_access_token("test-user-token-123")
    monkeypatch.setattr(settings, "dashboard_mcp_api_token", "")
    client = mcp_manager.get_client("sap")
    assert client.headers.get("Authorization") == "Bearer test-user-token-123"

    # 2. Saat contextvar None, gunakan fallback dashboard_mcp_api_token
    set_dashboard_access_token(None)
    monkeypatch.setattr(settings, "dashboard_mcp_api_token", "fallback-static-token-456")
    client2 = mcp_manager.get_client("sap")
    assert client2.headers.get("Authorization") == "Bearer fallback-static-token-456"

    # 3. Saat contextvar None dan dashboard_mcp_api_token kosong, raise PermissionError
    monkeypatch.setattr(settings, "dashboard_mcp_api_token", "")
    with pytest.raises(PermissionError, match="Dashboard access token is required"):
        mcp_manager.get_client("sap")


def test_chat_stream_with_active_server_propagates_token(client, make_user, monkeypatch):
    """Verifikasi request /api/chat/stream dengan active_server menyalurkan dashboard token tanpa error disconnect."""
    import json
    from auth import get_dashboard_access_token
    from models import ChatResponse
    import agent
    captured_tokens = []

    async def fake_get_all_tools(server_filter=None, allowed_connectors=None):
        token = get_dashboard_access_token()
        captured_tokens.append((server_filter, token))
        if token:
            tool_obj = MagicMock()
            tool_obj.name = "read_table"
            tool_obj.description = "baca"
            tool_obj.inputSchema = {}
            return [{"server": "sap", "tool": tool_obj}]
        return []

    monkeypatch.setattr(agent.mcp_manager, "get_all_tools", fake_get_all_tools)

    class FakeLLM:
        def bind_tools(self, tools, **kwargs):
            return self
        async def ainvoke(self, msgs):
            from langchain_core.messages import AIMessageChunk
            return AIMessageChunk(content="Data SAP berhasil diambil.")
        async def astream(self, msgs):
            from langchain_core.messages import AIMessageChunk
            yield AIMessageChunk(content="Data SAP berhasil diambil.")

    monkeypatch.setattr(agent, "ChatOpenAI", lambda **kw: FakeLLM())
    auth = make_user("sap_stream_user", role="superadmin")
    payload = {
        "message": "Cek status SAP",
        "active_server": "sap:sandbox-new",
    }

    with client.stream("POST", "/api/chat/stream", json=payload, headers=auth) as res:
        assert res.status_code == 200
        raw = "".join(res.iter_text())
        events = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith("data: ")]

    results = [e for e in events if e["type"] == "result"]
    assert len(results) == 1
    reply = results[0]["data"]["reply"]
    assert "Koneksi ke sistem target terputus" not in reply
    assert len(captured_tokens) > 0
    assert captured_tokens[0][0] == "sap:sandbox-new"
    assert captured_tokens[0][1] is not None
    assert len(captured_tokens[0][1]) > 10

@pytest.mark.asyncio
async def test_set_active_sap_server_unlocked_uses_canonical_resource_key():
    """Verifikasi _set_active_sap_server_unlocked mengirim resource_key kanonis 'sap:<target>'
    agar tidak ditolak otorisasi Gateway dashboard-mcp, sementara server_ref tetap alias target."""
    from mcp_manager import mcp_manager, MCPCallResult, MCPContentItem

    mock_client = MagicMock()
    mock_client.call_tool = AsyncMock(
        return_value=MCPCallResult(content=[MCPContentItem(text='{"success": true}')], is_error=False)
    )

    with patch.object(mcp_manager, "get_client", return_value=mock_client):
        ok = await mcp_manager._set_active_sap_server_unlocked(
            http_client=MagicMock(),
            target_sap="sandbox-new",
            sap_credentials={"sap_user": "TESTUSER", "sap_password": "PASSWORD", "sap_client": "100"}
        )
        assert ok is True
        mock_client.call_tool.assert_called_once()
        called_payload = mock_client.call_tool.call_args[0][2]
        assert called_payload["server_ref"] == "sandbox-new"
        assert called_payload["resource_key"] == "sap:sandbox-new"
