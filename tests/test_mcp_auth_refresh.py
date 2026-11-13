"""Gateway MCP menolak token OIDC (401): refresh sekali, lalu gagal secara eksplisit.

Regresi produksi: token akses dicabut di Dashboard sementara masa berlaku lokal
masih tersisa. Gateway membalas 401, katalog tool SAP kosong, dan agent lanjut
tanpa tool sehingga model mengarang hasil "SAP".
"""
import asyncio
import json

import httpx
import pytest

import agent
import mcp_manager as mm
from models import ChatRequest


def _transport(responder):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        calls.append((request.headers.get("authorization"), body.get("method")))
        return responder(request, body)

    return httpx.MockTransport(handler), calls


def _ok(body):
    method = body.get("method")
    if method == "tools/list":
        return httpx.Response(200, json={"result": {"tools": [{"name": "read_table", "description": "x"}]}})
    if method == "tools/call":
        return httpx.Response(200, json={"result": {"content": [{"type": "text", "text": "ok"}]}})
    return httpx.Response(200, json={"result": {}})


def _accept_only(token):
    def responder(request, body):
        if request.headers.get("authorization") != f"Bearer {token}":
            return httpx.Response(401, json={"message": "Invalid access token"})
        return _ok(body)
    return responder


def test_list_tools_refreshes_token_once_after_401():
    transport, calls = _transport(_accept_only("fresh"))
    rejected = []

    async def refresher(old):
        rejected.append(old)
        return "fresh"

    client = mm.StreamableHttpClient("sap", "http://gw/v1/gateway/mcp-sap",
                                     {"Authorization": "Bearer stale"}, token_refresher=refresher)

    async def run():
        async with httpx.AsyncClient(transport=transport) as http:
            return await client.list_tools(http)

    tools = asyncio.run(run())
    assert [t.name for t in tools] == ["read_table"]
    assert rejected == ["stale"]
    assert client.headers["Authorization"] == "Bearer fresh"
    assert calls[0] == ("Bearer stale", "initialize")
    assert all(auth == "Bearer fresh" for auth, _ in calls[1:])


def test_call_tool_refreshes_token_once_after_401():
    transport, _ = _transport(_accept_only("fresh"))

    async def refresher(old):
        return "fresh"

    client = mm.StreamableHttpClient("sap", "http://gw/v1/gateway/mcp-sap",
                                     {"Authorization": "Bearer stale"}, token_refresher=refresher)

    async def run():
        async with httpx.AsyncClient(transport=transport) as http:
            return await client.call_tool(http, "read_table", {"table": "TVAK"})

    result = asyncio.run(run())
    assert result.content[0].text == "ok"


def test_401_without_successful_refresh_raises_auth_error():
    transport, calls = _transport(_accept_only("never"))

    async def refresher(old):
        return None

    client = mm.StreamableHttpClient("sap", "http://gw/v1/gateway/mcp-sap",
                                     {"Authorization": "Bearer stale"}, token_refresher=refresher)

    async def run():
        async with httpx.AsyncClient(transport=transport) as http:
            await client.list_tools(http)

    with pytest.raises(mm.MCPAuthError):
        asyncio.run(run())
    assert len(calls) == 1  # tidak mengulang bila refresh gagal


def test_get_all_tools_reports_auth_failure(monkeypatch):
    class Rejecting:
        async def list_tools(self, http_client, force_refresh=False):
            raise mm.MCPAuthError("sap")

    class Empty:
        async def list_tools(self, http_client, force_refresh=False):
            return []

    manager = mm.MCPManager()
    monkeypatch.setattr(manager, "get_client", lambda name: Rejecting() if name == "sap" else Empty())

    async def no_resources():
        return []

    monkeypatch.setattr(manager, "get_live_resources", no_resources)
    errors = {}
    tools = asyncio.run(manager.get_all_tools(server_filter="sap:dev", allowed_connectors={"sap"}, errors=errors))
    assert tools == []
    assert errors == {"sap": "auth"}


def _sap_chat(monkeypatch, failure):
    async def no_sap_tools(server_filter="all", allowed_connectors=None, errors=None):
        if errors is not None:
            errors["sap"] = failure
        return []

    def unexpected_model(*args, **kwargs):
        raise AssertionError("Model tidak boleh dipanggil tanpa tool SAP pada target SAP")

    async def saved_status(*args, **kwargs):
        return [{"id": "c1", "target": "dev"}]

    import oidc_sap_credentials as osc
    monkeypatch.setattr(osc, "list_status", saved_status)
    monkeypatch.setattr(osc, "saved_credentials", lambda rows: [{"connection_id": "c1"}])
    monkeypatch.setattr(osc, "_connection_id", lambda row: "c1")
    monkeypatch.setattr(osc, "_target_names", lambda row: {"dev"})
    monkeypatch.setattr(agent.mcp_manager, "get_all_tools", no_sap_tools)
    monkeypatch.setattr(agent, "_buat_llm", unexpected_model)
    return asyncio.run(agent.process_chat(ChatRequest(
        message="cek order type ZP14",
        active_server="sap:dev",
        sap_target="dev",
        enabled_connectors=["sap"],
        language="id",
    ), oidc_sub="user-1"))


def test_sap_target_with_rejected_session_asks_relogin(monkeypatch):
    response = _sap_chat(monkeypatch, "auth")
    assert "login ulang" in response.reply.lower()
    assert response.sources == []


def test_sap_target_without_tools_does_not_answer_from_model(monkeypatch):
    response = _sap_chat(monkeypatch, "error")
    assert "tidak dapat mengakses sap" in response.reply.lower()
    assert "login ulang" not in response.reply.lower()
