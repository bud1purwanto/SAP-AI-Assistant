"""MCP URL registry stores only name+url; get_client uses only user OIDC token."""

def test_list_mcp_servers_no_token_field():
    """list_mcp_servers result dicts must not contain auth_token."""
    from database import list_mcp_servers
    servers = list_mcp_servers()
    for s in servers:
        assert "auth_token" not in s, f"auth_token leaked in {s['name']}"

def test_get_client_no_static_fallback():
    """get_client must not reference dashboard_mcp_api_token."""
    import inspect, mcp_manager as mm
    source = inspect.getsource(mm.MCPManager.get_client)
    assert "dashboard_mcp_api_token" not in source, \
        "get_client still references static dashboard_mcp_api_token"

def test_crud_endpoints_and_database_functions():
    import database
    # Test save_mcp_server
    saved = database.save_mcp_server("test-srv", "Test Server", "http://test-server:8000", True)
    assert saved is not None
    assert saved["id"] == "test-srv"
    assert saved["name"] == "Test Server"
    assert saved["url"] == "http://test-server:8000"
    assert saved["enabled"] is True
    assert "auth_token" not in saved
    assert "headers" not in saved

    # Test get_mcp_server
    fetched = database.get_mcp_server("test-srv")
    assert fetched is not None
    assert fetched["id"] == "test-srv"
    assert fetched["name"] == "Test Server"
    assert "auth_token" not in fetched

    # Test update_mcp_server
    updated = database.update_mcp_server("test-srv", name="Updated Server", url="http://test-server:9000", enabled=False)
    assert updated is not None
    assert updated["name"] == "Updated Server"
    assert updated["url"] == "http://test-server:9000"
    assert updated["enabled"] is False

    # Test delete_mcp_server
    deleted = database.delete_mcp_server("test-srv")
    assert deleted is True
    assert database.get_mcp_server("test-srv") is None
