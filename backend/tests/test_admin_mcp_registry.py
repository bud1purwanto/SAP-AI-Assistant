"""Admin MCP registry returns editable URLs separately from live status."""

import pytest

import main


@pytest.mark.asyncio
async def test_registry_returns_local_urls(monkeypatch):
    rows = [{"id": "sap", "name": "SAP", "url": "http://sap.example/mcp", "enabled": True}]
    monkeypatch.setattr(main.database, "list_mcp_servers", lambda: rows)
    assert await main.get_admin_mcp_registry_endpoint(admin={"username": "admin"}) == {"servers": rows}


@pytest.mark.asyncio
async def test_create_preserves_explicit_server_id(monkeypatch):
    captured = {}

    def save_mcp_server(**kwargs):
        captured.update(kwargs)
        return {"id": kwargs["sid"], "name": kwargs["name"], "url": kwargs["url"]}

    monkeypatch.setattr(main.database, "save_mcp_server", save_mcp_server)
    request = main.CreateMcpServerRequest(id="sap", name="SAP NetWeaver", url="http://sap.example/mcp")
    result = await main.create_admin_mcp_server_endpoint(request, admin={"username": "admin"})
    assert captured["sid"] == "sap"
    assert result["server"]["id"] == "sap"
