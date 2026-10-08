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
@pytest.mark.parametrize("tool_name", ["read_table", "get_system_info", "call_function"])
def test_all_known_production_tool_calls_confirm_selected_target(target, resource_key, tool_name):
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
        "sap", tool_name, {"table": "MARD", "resource_key": "sap:dev"}, sap_target=target
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
    assert calls[1][0] == tool_name
    assert "confirm_production" not in calls[1][1]
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
    assert "confirm_production" not in calls[1][1]


def test_rejected_production_selection_does_not_call_requested_tool():
    manager = MCPManager()
    calls = []

    async def live_resources():
        return [{"kind": "sap", "resource_key": "sap:prod", "aliases": ["prod-aix"], "is_production": True}]

    class FakeClient:
        _initialized = True

        async def call_tool(self, _http_client, name, args, extra_headers=None):
            calls.append((name, args.copy()))
            return MCPCallResult([MCPContentItem(
                '{"mode":"LIVE","error":"Production server requires confirm_production == true."}'
            )])

    manager.get_live_resources = live_resources
    manager.get_client = lambda _name: FakeClient()
    result = asyncio.run(manager.call_tool("sap", "get_system_info", {}, sap_target="prod-aix"))

    assert result.is_error is True
    assert all(name == "set_active_server" for name, _ in calls)
    assert all(args["confirm_production"] is True for _, args in calls)


def test_sap_call_without_target_stops_before_gateway():
    manager = MCPManager()
    result = asyncio.run(manager.call_tool("sap", "get_system_info", {}))
    assert result.is_error is True
    assert "Target SAP wajib dipilih" in result.content[0].text


def test_direct_set_active_server_uses_single_confirmed_selection():
    manager = MCPManager()
    calls = []

    async def live_resources():
        return [{"kind": "sap", "resource_key": "sap:prod", "aliases": ["prod-aix"], "is_production": True}]

    class FakeClient:
        async def call_tool(self, _http_client, name, args, extra_headers=None):
            calls.append((name, args.copy()))
            return MCPCallResult([MCPContentItem('{"success": true}')])

    manager.get_live_resources = live_resources
    manager.get_client = lambda _name: FakeClient()
    result = asyncio.run(manager.call_tool(
        "sap", "set_active_server", {"server_ref": "dev"}, sap_target="prod-aix"
    ))

    assert result.is_error is False
    assert calls == [("set_active_server", {
        "server_ref": "prod-aix", "resource_key": "sap:prod", "confirm_production": True,
    })]


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
