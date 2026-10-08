import asyncio
from unittest.mock import patch

import pytest

from mcp_manager import MCPCallResult, MCPContentItem, MCPManager, resolve_sap_resource_key


def test_sap_uses_enabled_registry_url():
    manager = MCPManager()
    with patch("database.get_mcp_server", return_value={
        "id": "sap", "enabled": True, "url": "http://dashboard.example/v1/gateway/mcp-sap",
        "auth_token": "legacy-token",
    }):
        url, headers = manager._get_client_config("sap")

    assert url == "http://dashboard.example/v1/gateway/mcp-sap"
    assert headers == {"auth_token": "legacy-token"}


@pytest.mark.parametrize("registered", [None, {"id": "sap", "enabled": False, "url": "http://old.example/mcp"}])
def test_sap_never_falls_back_to_static_gateway(registered):
    manager = MCPManager()
    with patch("database.get_mcp_server", return_value=registered), \
         patch("database.list_mcp_servers", return_value=[]):
        with pytest.raises(RuntimeError):
            manager._get_client_config("sap")


@pytest.mark.parametrize("target,resource_key", [
    ("prod-aix", "sap:prod"),
    ("prod-win", "sap:prod-win"),
    ("prp", "sap:prod-win"),
])
def test_all_known_production_tool_calls_confirm_selected_target(target, resource_key):
    manager = MCPManager()
    calls = []

    async def live_resources():
        return [
            {"kind": "sap", "resource_key": "sap:prod", "label": "Production AIX",
             "aliases": ["prod", "prod-aix", "production", "prd"], "is_production": True},
            {"kind": "sap", "resource_key": "sap:prod-win", "label": "Production Windows",
             "aliases": ["prod-win", "prod-windows", "prp"], "is_production": True},
        ]

    class FakeClient:
        async def call_tool(self, _http_client, name, args, extra_headers=None):
            calls.append((name, args.copy(), dict(extra_headers or {})))
            return MCPCallResult([MCPContentItem('{"success": true}')])

    manager.get_client = lambda _name: FakeClient()
    manager.get_live_resources = live_resources
    result = asyncio.run(manager.call_tool(
        "sap", "read_table", {"table": "MARD"}, sap_target=target
    ))

    assert result.is_error is False
    assert resolve_sap_resource_key("prod") == "sap:prod"
    assert calls[0][0] == "set_active_server"
    assert calls[0][1] == {
        "server_ref": target,
        "resource_key": resource_key,
        "confirm_production": True,
    }
    assert calls[0][2]["X-Confirm-Production"] == "true"
    assert calls[1][1]["confirm_production"] is True
    assert calls[1][1]["resource_key"] == resource_key


def test_catalog_production_target_is_confirmed_without_static_alias():
    manager = MCPManager()
    calls = []

    async def live_resources():
        return [{
            "kind": "sap", "resource_key": "sap:factory-prd",
            "label": "Factory SAP", "aliases": ["factory"], "is_production": True,
        }]

    class FakeClient:
        async def call_tool(self, _http_client, name, args, extra_headers=None):
            calls.append((name, args.copy(), dict(extra_headers or {})))
            return MCPCallResult([MCPContentItem('{"success": true}')])

    manager.get_live_resources = live_resources
    manager.get_client = lambda _name: FakeClient()
    asyncio.run(manager.call_tool("sap", "read_table", {"table": "MARD"}, sap_target="factory"))

    assert calls[0][1]["resource_key"] == "sap:factory-prd"
    assert calls[0][1]["confirm_production"] is True
    assert calls[0][2]["X-Confirm-Production"] == "true"
    assert calls[1][1]["resource_key"] == "sap:factory-prd"
    assert calls[1][1]["confirm_production"] is True


def test_nonproduction_target_has_no_production_confirmation():
    manager = MCPManager()
    calls = []

    class FakeClient:
        async def call_tool(self, _http_client, name, args, extra_headers=None):
            calls.append((name, args.copy(), dict(extra_headers or {})))
            return MCPCallResult([MCPContentItem('{"success": true}')])

    manager.get_client = lambda _name: FakeClient()
    async def no_resources():
        return []
    manager.get_live_resources = no_resources
    asyncio.run(manager.call_tool("sap", "read_table", {"table": "MARD"}, sap_target="dev-aix"))

    assert all("confirm_production" not in args for _, args, _ in calls)
    assert all("X-Confirm-Production" not in headers for _, _, headers in calls)
