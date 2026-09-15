import pytest
from database import (
    list_mcp_servers,
    get_mcp_server,
    create_mcp_server,
    update_mcp_server,
    delete_mcp_server,
    reset_mcp_server_to_default,
    get_engine,
    text,
)


def test_dynamic_mcp_crud_and_validation(client, admin_auth):
    """Pengujian alur CRUD dynamic MCP servers dan validasi sistem bawaan."""
    # 1. Pastikan server sistem bawaan (sap, rag, sql) sudah ter-seed
    servers = list_mcp_servers()
    server_ids = [s["id"] for s in servers]
    assert "sap" in server_ids
    assert "rag" in server_ids
    assert "sql" in server_ids

    sap_srv = get_mcp_server("sap")
    assert sap_srv is not None
    assert sap_srv["is_system"] is True
    assert "Live Data" in sap_srv["description"]

    # 2. Update deskripsi & URL server sistem
    up_res = update_mcp_server("sap", {
        "description": "Deskripsi baru SAP kustom",
        "auth_token": "NewToken123",
    })
    assert up_res["success"] is True
    sap_updated = get_mcp_server("sap")
    assert sap_updated["description"] == "Deskripsi baru SAP kustom"

    # 3. Server sistem dilarang dihapus
    del_sys = delete_mcp_server("sap")
    assert del_sys["success"] is False
    assert "tidak dapat dihapus" in del_sys["message"]

    # 4. Tambah server kustom baru (Add New MCP)
    custom_id = "test-jira"
    create_res = create_mcp_server({
        "id": custom_id,
        "name": "Jira Gateway",
        "description": "Pelacak tiket dan issue Jira",
        "url": "http://192.168.1.162:8095/mcp",
        "transport_type": "http",
        "auth_token": "JiraSecretToken",
        "enabled": True,
    })
    assert create_res["success"] is True

    jira_srv = get_mcp_server(custom_id)
    assert jira_srv is not None
    assert jira_srv["name"] == "Jira Gateway"
    assert jira_srv["description"] == "Pelacak tiket dan issue Jira"
    assert jira_srv["is_system"] is False

    # 5. Update deskripsi custom server
    up_jira = update_mcp_server(custom_id, {
        "description": "Deskripsi Jira yang diperbarui",
        "name": "Jira Enterprise Gateway",
    })
    assert up_jira["success"] is True
    assert get_mcp_server(custom_id)["description"] == "Deskripsi Jira yang diperbarui"

    # 6. Hapus server kustom
    del_res = delete_mcp_server(custom_id)
    assert del_res["success"] is True
    assert get_mcp_server(custom_id) is None

    # 7. Reset server sistem ke default
    reset_res = reset_mcp_server_to_default("sap")
    assert reset_res["success"] is True
    sap_reset = get_mcp_server("sap")
    assert "Live Data" in sap_reset["description"]


def test_dynamic_mcp_endpoints(client, admin_auth):
    """Local MCP registry CRUD endpoints are decommissioned (410 Gone).

    Upstream MCP server configuration now lives in the Dashboard MCP Gateway.
    SAP admins must use the Dashboard; the legacy REST endpoints return 410.
    """
    # GET /api/admin/mcp/servers -> 410 Gone
    res = client.get("/api/admin/mcp/servers", headers=admin_auth)
    assert res.status_code == 410

    # POST create -> 410
    new_srv = {
        "id": "github-mcp",
        "name": "GitHub Repository Gateway",
        "description": "Integrasi repository dan PR GitHub",
        "url": "http://127.0.0.1:8999/mcp",
        "transport_type": "http",
        "auth_token": "ghp_mock_token_123",
        "enabled": True,
    }
    create_res = client.post("/api/admin/mcp/servers", json=new_srv, headers=admin_auth)
    assert create_res.status_code == 410

    # PUT update -> 410
    update_res = client.put(
        "/api/admin/mcp/servers/github-mcp",
        json={"description": "Deskripsi GitHub Baru", "name": "GitHub Enterprise Gateway"},
        headers=admin_auth,
    )
    assert update_res.status_code == 410

    # DELETE system server -> 410 (no longer a 400 "cannot delete system")
    del_sys_res = client.delete("/api/admin/mcp/servers/sap", headers=admin_auth)
    assert del_sys_res.status_code == 410

    # DELETE custom server -> 410
    del_custom_res = client.delete("/api/admin/mcp/servers/github-mcp", headers=admin_auth)
    assert del_custom_res.status_code == 410

    # POST reset -> 410
    reset_res = client.post("/api/admin/mcp/servers/sap/reset", headers=admin_auth)
    assert reset_res.status_code == 410

def test_admin_stats_dynamic_mcp(client, admin_auth):
    """Endpoint stats dashboard tetap menyajikan status MCP server yang dikonfigurasi."""
    res = client.get("/api/admin/stats", headers=admin_auth)
    assert res.status_code == 200
    data = res.json()
    assert "mcp_status" in data
    assert "mcp_servers" in data

    srv_ids = [s["id"] for s in data["mcp_servers"]]
    assert "sap" in srv_ids
    assert "rag" in srv_ids
    assert "sql" in srv_ids
    assert "email" in srv_ids


def test_mcp_manager_requires_dashboard_token(monkeypatch):
    from auth import set_dashboard_access_token
    from mcp_manager import MCPManager
    set_dashboard_access_token(None)
    with pytest.raises(PermissionError):
        MCPManager().get_client("rag")


def test_mcp_manager_uses_dashboard_bearer_token(monkeypatch):
    from auth import set_dashboard_access_token
    from mcp_manager import MCPManager
    from config import settings

    monkeypatch.setattr(settings, "dashboard_mcp_gateway_url", "http://127.0.0.1:3000/api/mcp")
    set_dashboard_access_token("dashboard-token-xyz")
    manager = MCPManager()
    gw = settings.dashboard_mcp_gateway_url.rstrip("/")

    for name in ("rag", "sap", "sql", "email"):
        client = manager.get_client(name)
        assert client.url == gw or client.url.startswith(gw + "/")
        assert "192.168.1.162" not in client.url
        assert "Trias123" not in repr(client.headers)
        assert client.headers["Authorization"] == "Bearer dashboard-token-xyz"
        assert "X-SAP-Service" not in client.headers

    set_dashboard_access_token(None)

def test_admin_mcp_direct_server_crud_removed(client, admin_auth):
    """Local MCP registry CRUD endpoints are decommissioned (410 Gone / 404)."""
    # GET list
    r_get = client.get("/api/admin/mcp/servers", headers=admin_auth)
    assert r_get.status_code in (404, 410), r_get.status_code
    # POST create
    r_post = client.post(
        "/api/admin/mcp/servers",
        json={"id": "x", "name": "X", "url": "http://x/mcp"},
        headers=admin_auth,
    )
    assert r_post.status_code in (404, 410), r_post.status_code
    # PUT update
    r_put = client.put(
        "/api/admin/mcp/servers/x",
        json={"name": "X2"},
        headers=admin_auth,
    )
    assert r_put.status_code in (404, 410), r_put.status_code
    # DELETE
    r_del = client.delete("/api/admin/mcp/servers/x", headers=admin_auth)
    assert r_del.status_code in (404, 410), r_del.status_code
    # POST reset
    r_reset = client.post("/api/admin/mcp/servers/x/reset", headers=admin_auth)
    assert r_reset.status_code in (404, 410), r_reset.status_code


