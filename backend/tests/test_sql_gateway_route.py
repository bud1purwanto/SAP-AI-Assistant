import asyncio
from unittest.mock import AsyncMock, patch

from auth import set_dashboard_access_token
from config import settings
from mcp_manager import MCPCallResult, MCPManager


def test_sql_ignores_obsolete_registry_and_uses_user_oidc_token():
    manager = MCPManager()
    with patch("database.get_mcp_server", return_value={
        "id": "sql", "enabled": True, "url": "http://legacy.example/mcp",
        "auth_token": "legacy-token",
    }):
        set_dashboard_access_token("user-oidc-token")
        try:
            client = manager.get_client("sql")
        finally:
            set_dashboard_access_token(None)

    assert client.url == settings.dashboard_mcp_gateway_url.rstrip("/")
    assert client.headers["Authorization"] == "Bearer user-oidc-token"


def test_sql_target_uses_canonical_gateway_resource_key():
    manager = MCPManager()
    fake_client = type("FakeClient", (), {})()
    fake_client.call_tool = AsyncMock(return_value=MCPCallResult([]))
    resources = [{"kind": "sql", "label": "dev-224", "resource_key": "mssql:dev-224"}]
    with patch.object(manager, "get_client", return_value=fake_client), \
         patch.object(manager, "get_live_resources", new=AsyncMock(return_value=resources)):
        result = asyncio.run(manager.call_tool(
            "sql", "run_query", {"query": "SELECT 1"}, sql_target="dev-224"
        ))

    assert not result.is_error
    assert fake_client.call_tool.await_count == 2
    assert fake_client.call_tool.await_args_list[0].args[2] == {
        "server_ref": "dev-224", "resource_key": "mssql:dev-224"
    }
    assert fake_client.call_tool.await_args_list[1].args[2]["resource_key"] == "mssql:dev-224"


def test_unknown_sql_target_does_not_run_query():
    manager = MCPManager()
    fake_client = type("FakeClient", (), {})()
    fake_client.call_tool = AsyncMock(return_value=MCPCallResult([]))
    with patch.object(manager, "get_client", return_value=fake_client), \
         patch.object(manager, "get_live_resources", new=AsyncMock(return_value=[])):
        result = asyncio.run(manager.call_tool(
            "sql", "run_query", {"query": "SELECT 1"}, sql_target="unknown"
        ))

    assert result.is_error
    fake_client.call_tool.assert_not_awaited()
