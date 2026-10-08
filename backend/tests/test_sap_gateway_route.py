import asyncio
import json
from unittest.mock import patch

import httpx
import pytest

from mcp_manager import MCPCallResult, MCPContentItem, MCPManager, StreamableHttpClient, resolve_sap_resource_key


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
    assert resolve_sap_resource_key("prod", manager._resources_cache) == "sap:prod"
    assert calls[0][0] == "set_active_server"
    assert calls[0][1] == {
        "server_ref": target,
        "resource_key": resource_key,
        "confirm_production": True,
    }
    assert calls[0][2]["X-Confirm-Production"] == "true"
    assert calls[1][0] == tool_name
    assert calls[1][2]["X-Confirm-Production"] == "true"
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
    assert calls[1][2]["X-Confirm-Production"] == "true"


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
    async def resources():
        return [{"kind": "sap", "resource_key": "sap:training", "aliases": ["production-training"],
                 "is_production": False}]
    manager.get_live_resources = resources
    result = asyncio.run(manager.call_tool(
        "sap", "read_table", {"table": "MARD", "confirm_production": True}, sap_target="production-training"
    ))

    assert result.is_error is False
    assert [name for name, _, _ in calls] == ["set_active_server", "read_table"]
    assert all("confirm_production" not in args for _, args, _ in calls)
    assert all("X-Confirm-Production" not in headers for _, _, headers in calls)


def test_unknown_target_is_not_guessed_from_production_name():
    manager = MCPManager()

    async def resources():
        return []

    manager.get_live_resources = resources
    with patch.object(manager, "get_client") as get_client:
        result = asyncio.run(manager.call_tool("sap", "get_system_info", {}, sap_target="prod-aix"))

    assert result.is_error is True
    assert "SAP_TARGET_NOT_FOUND" in result.content[0].text
    get_client.assert_not_called()


def test_public_server_selection_resolves_production_from_live_catalog():
    manager = MCPManager()
    calls = []

    async def resources():
        return [{"kind": "sap", "resource_key": "sap:business", "aliases": ["primary"],
                 "is_production": True}]

    class FakeClient:
        async def call_tool(self, _http_client, name, args, extra_headers=None):
            calls.append((name, args.copy()))
            return MCPCallResult([MCPContentItem('{"success": true}')])

    manager.get_live_resources = resources
    manager.get_client = lambda _name: FakeClient()
    asyncio.run(manager.set_active_sap_server("primary"))

    assert calls == [("set_active_server", {
        "server_ref": "primary", "resource_key": "sap:business", "confirm_production": True,
    })]


@pytest.mark.parametrize("target,key", [
    ("prod-aix", "sap:prod"),
    ("prod-win", "sap:prod-win"),
    ("factory", "sap:factory"),
])
@pytest.mark.parametrize("tool_name,arguments", [
    ("get_system_info", {}),
    ("get_server_date", {}),
    ("read_table", {"table": "MARC", "rowcount": 1}),
    ("call_function", {"function_name": "RFC_SYSTEM_INFO", "parameters": {}}),
])
def test_every_production_http_request_contains_boolean_confirmation(target, key, tool_name, arguments):
    """Uji body JSON yang diterima gateway, bukan hanya argumen mock client."""
    requests = []

    def gateway(request):
        body = json.loads(request.content)
        result = {}
        if body.get("method") == "tools/call":
            params = body["params"]
            requests.append(params)
            confirmed = params["arguments"].get("confirm_production") is True
            result = {
                "isError": not confirmed,
                "content": [{"type": "text", "text": json.dumps(
                    {"success": True} if confirmed else {
                        "error": "Production server requires confirm_production === true."
                    }
                )}],
            }
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body.get("id"), "result": result})

    manager = MCPManager()
    sap_client = StreamableHttpClient("sap", "http://gateway.test/v1/gateway/mcp-sap", {})
    manager.get_client = lambda _name: sap_client

    async def resources():
        return [{"kind": "sap", "resource_key": key, "aliases": [target], "is_production": True}]

    manager.get_live_resources = resources
    async_client = httpx.AsyncClient
    with patch("mcp_manager.httpx.AsyncClient", side_effect=lambda: async_client(transport=httpx.MockTransport(gateway))):
        result = asyncio.run(manager.call_tool("sap", tool_name, arguments, sap_target=target))

    assert result.is_error is False
    assert [item["name"] for item in requests] == ["set_active_server", tool_name]
    assert all(item["arguments"]["confirm_production"] is True for item in requests)
    assert all(item["arguments"]["resource_key"] == key for item in requests)
    assert "confirm_production" not in arguments  # Argumen pemanggil tetap utuh.


def test_production_confirmation_does_not_leak_to_next_nonproduction_http_request():
    requests = []

    def gateway(request):
        body = json.loads(request.content)
        if body.get("method") == "tools/call":
            requests.append(body["params"]["arguments"])
        return httpx.Response(200, json={"result": {"content": []}})

    async def run():
        sap_client = StreamableHttpClient("sap", "http://gateway.test/v1/gateway/mcp-sap", {})
        async with httpx.AsyncClient(transport=httpx.MockTransport(gateway)) as http:
            await sap_client.call_tool(http, "get_system_info", {"confirm_production": False},
                                       extra_headers={"X-Confirm-Production": "true"})
            await sap_client.call_tool(http, "get_system_info", {})

    asyncio.run(run())
    assert requests[0]["confirm_production"] is True
    assert "confirm_production" not in requests[1]
