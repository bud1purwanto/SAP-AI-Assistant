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
    """Pengujian endpoint REST API superadmin untuk dynamic MCP servers."""
    # 1. GET /api/admin/mcp/servers
    res = client.get("/api/admin/mcp/servers", headers=admin_auth)
    assert res.status_code == 200
    data = res.json()
    assert "servers" in data
    server_map = {s["id"]: s for s in data["servers"]}
    assert "sap" in server_map
    assert "rag" in server_map
    assert "sql" in server_map

    # 2. POST /api/admin/mcp/servers (Add new custom MCP)
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
    assert create_res.status_code == 200
    assert create_res.json()["success"] is True

    # 3. PUT /api/admin/mcp/servers/github-mcp (Update description & name)
    update_res = client.put(
        "/api/admin/mcp/servers/github-mcp",
        json={"description": "Deskripsi GitHub Baru", "name": "GitHub Enterprise Gateway"},
        headers=admin_auth,
    )
    assert update_res.status_code == 200
    assert update_res.json()["success"] is True

    # Verify update in GET list
    list_res = client.get("/api/admin/mcp/servers", headers=admin_auth)
    updated_map = {s["id"]: s for s in list_res.json()["servers"]}
    assert updated_map["github-mcp"]["description"] == "Deskripsi GitHub Baru"
    assert updated_map["github-mcp"]["name"] == "GitHub Enterprise Gateway"

    # 4. POST /api/admin/mcp/test (Test connection to mock URL)
    test_res = client.post(
        "/api/admin/mcp/test",
        json={"server_id": "github-mcp"},
        headers=admin_auth,
    )
    assert test_res.status_code == 200
    test_data = test_res.json()
    assert "online" in test_data
    assert "latency_ms" in test_data
    assert "message" in test_data

    # 5. DELETE system server must fail (400 Bad Request)
    del_sys_res = client.delete("/api/admin/mcp/servers/sap", headers=admin_auth)
    assert del_sys_res.status_code == 400
    assert "tidak dapat dihapus" in del_sys_res.json()["detail"]

    # 6. DELETE custom server
    del_custom_res = client.delete("/api/admin/mcp/servers/github-mcp", headers=admin_auth)
    assert del_custom_res.status_code == 200
    assert del_custom_res.json()["success"] is True

    # 7. POST /api/admin/mcp/servers/sap/reset
    reset_res = client.post("/api/admin/mcp/servers/sap/reset", headers=admin_auth)
    assert reset_res.status_code == 200
    assert reset_res.json()["success"] is True


def test_admin_stats_dynamic_mcp(client, admin_auth):
    """Pengujian integrasi dynamic MCP servers pada endpoint stats dashboard."""
    # 1. GET /api/admin/stats harus memuat mcp_servers dan mcp_status
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

    # 2. Tambah custom MCP server
    custom_srv = {
        "id": "stats-custom-mcp",
        "name": "Live Stats Custom Gateway",
        "description": "Custom Gateway untuk Dashboard Stats",
        "url": "http://127.0.0.1:8998/mcp",
        "enabled": True,
    }
    create_res = client.post("/api/admin/mcp/servers", json=custom_srv, headers=admin_auth)
    assert create_res.status_code == 200

    # 3. GET /api/admin/stats sekarang harus menyertakan custom server
    stats_after = client.get("/api/admin/stats", headers=admin_auth).json()
    after_ids = [s["id"] for s in stats_after["mcp_servers"]]
    assert "stats-custom-mcp" in after_ids
    custom_item = next(s for s in stats_after["mcp_servers"] if s["id"] == "stats-custom-mcp")
    assert custom_item["name"] == "Live Stats Custom Gateway"
    assert "online" in custom_item

    # 4. Hapus custom server dan verifikasi bersih kembali
    del_res = client.delete("/api/admin/mcp/servers/stats-custom-mcp", headers=admin_auth)
    assert del_res.status_code == 200
    stats_clean = client.get("/api/admin/stats", headers=admin_auth).json()
    clean_ids = [s["id"] for s in stats_clean["mcp_servers"]]
    assert "stats-custom-mcp" not in clean_ids


def test_dynamic_mcp_access_control_auto_sync(client, admin_auth):
    """Pengujian bahwa server MCP baru otomatis masuk ke Resource Katalog, Role Matrix, dan User Overrides."""
    custom_srv = {
        "id": "postgres-prod",
        "name": "PostgreSQL Production DB",
        "description": "Database PostgreSQL Transaksional",
        "url": "http://127.0.0.1:8997/mcp",
        "enabled": True,
    }

    # 1. Daftarkan server MCP baru
    create_res = client.post("/api/admin/mcp/servers", json=custom_srv, headers=admin_auth)
    assert create_res.status_code == 200

    try:
        # 2. Periksa katalog sumber daya mcp_resources
        res_list = client.get("/api/admin/access/resources", headers=admin_auth).json()["resources"]
        res_keys = [r["resource_key"] for r in res_list]
        assert "sql:postgres-prod" in res_keys
        pg_res = next(r for r in res_list if r["resource_key"] == "sql:postgres-prod")
        assert pg_res["label"] == "PostgreSQL Production DB"
        assert pg_res["kind"] == "sql"
        assert pg_res["is_production"] is True

        # 3. Periksa User Overrides (GET /api/admin/access/users/{username})
        user_matrix = client.get("/api/admin/access/users/TRSTDEV", headers=admin_auth).json()
        u_res_keys = [r["resource_key"] for r in user_matrix["resources"]]
        assert "sql:postgres-prod" in u_res_keys
        u_pg_res = next(r for r in user_matrix["resources"] if r["resource_key"] == "sql:postgres-prod")
        # Default state harus inherit
        assert u_pg_res["state"] == "inherit"

        # 4. Periksa Role Matrix (GET /api/admin/access/roles)
        role_matrix = client.get("/api/admin/access/roles", headers=admin_auth).json()
        matrix_res_keys = [r["resource_key"] for r in role_matrix["resources"]]
        assert "sql:postgres-prod" in matrix_res_keys

    finally:
        # 5. Hapus server MCP dan verifikasi soft-archive dari active resources
        del_res = client.delete("/api/admin/mcp/servers/postgres-prod", headers=admin_auth)
        assert del_res.status_code == 200

        # Verifikasi sudah di-archive (tidak muncul lagi di active resources)
        res_after = client.get("/api/admin/access/resources", headers=admin_auth).json()["resources"]
        after_keys = [r["resource_key"] for r in res_after]
        assert "sql:postgres-prod" not in after_keys



