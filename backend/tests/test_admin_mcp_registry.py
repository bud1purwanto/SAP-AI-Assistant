"""Admin MCP registry returns editable URLs separately from live status."""

import asyncio
import pytest

import main


def test_registry_returns_local_urls(monkeypatch):
    rows = [{"id": "sap", "name": "SAP", "url": "http://sap.example/mcp", "enabled": True}]
    monkeypatch.setattr(main.database, "list_mcp_servers", lambda: rows)
    assert asyncio.run(main.get_admin_mcp_registry_endpoint(admin={"username": "admin"})) == {"servers": rows}


def test_create_preserves_explicit_server_id(monkeypatch):
    captured = {}

    def save_mcp_server(**kwargs):
        captured.update(kwargs)
        return {"id": kwargs["sid"], "name": kwargs["name"], "url": kwargs["url"]}

    monkeypatch.setattr(main.database, "save_mcp_server", save_mcp_server)
    request = main.CreateMcpServerRequest(id="sap", name="SAP NetWeaver", url="http://sap.example/mcp")
    result = asyncio.run(main.create_admin_mcp_server_endpoint(request, admin={"username": "admin"}))
    assert captured["sid"] == "sap"
    assert result["server"]["id"] == "sap"
