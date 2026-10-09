import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from models import ChatRequest
from agent import process_chat


def test_agent_passes_allowed_connectors():
    req = ChatRequest(
        message="cek data",
        enabled_connectors=["sap", "sql"],
        sap_target="sandbox-new",
        sql_target="dev-223",
    )
    captured = {}

    async def fake_get_all_tools(server_filter="all", allowed_connectors=None):
        captured["args"] = (server_filter, allowed_connectors)
        return [{"server": "sap", "tool": SimpleNamespace(name="read_table", description="Read Table", inputSchema={})}]

    with patch("mcp_manager.mcp_manager.get_all_tools", side_effect=fake_get_all_tools), \
         patch("oidc_sap_credentials.list_status", new_callable=AsyncMock, return_value=[
             {"connectionId": "sandbox-connection", "resourceKey": "sap:sandbox-new",
              "configured": True, "username": "SAP_USER"},
         ]), \
         patch("database.get_user_sap_token") as local_token, \
         patch("agent._buat_llm", return_value=None):
        asyncio.run(process_chat(chat_req=req, user_role="user", username="test-user", oidc_sub="oidc-test-user"))

    local_token.assert_not_called()
    assert "args" in captured, "get_all_tools must be called"
    server_filter, allowed_conn = captured["args"]
    assert allowed_conn == {"sap", "sql"}, f"allowed_conn={allowed_conn}"
    assert "sandbox-new" in server_filter


def test_active_sql_target_does_not_override_disabled_connector():
    req = ChatRequest(
        message="cek stored procedure",
        active_server="sql:dev-224",
        enabled_connectors=["rag", "email"],
    )
    captured = {}

    async def fake_get_all_tools(server_filter="all", allowed_connectors=None):
        captured["args"] = (server_filter, allowed_connectors)
        return []

    with patch("mcp_manager.mcp_manager.get_all_tools", side_effect=fake_get_all_tools), \
         patch("agent._buat_llm", return_value=None):
        asyncio.run(process_chat(chat_req=req, user_role="user", username="test-user", oidc_sub="oidc-test-user"))

    assert captured["args"] == ("general", {"rag", "email"})


def test_empty_connector_selection_does_not_enable_all_tools():
    req = ChatRequest(message="cek data", active_server="sql:dev-224", enabled_connectors=[])
    captured = {}

    async def fake_get_all_tools(server_filter="all", allowed_connectors=None):
        captured["args"] = (server_filter, allowed_connectors)
        return []

    with patch("mcp_manager.mcp_manager.get_all_tools", side_effect=fake_get_all_tools), \
         patch("agent._buat_llm", return_value=None):
        asyncio.run(process_chat(chat_req=req, user_role="user", username="test-user", oidc_sub="oidc-test-user"))

    assert captured["args"] == ("general", set())
