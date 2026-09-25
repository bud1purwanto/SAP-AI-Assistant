import asyncio
from types import SimpleNamespace
from unittest.mock import patch
from models import ChatRequest


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
         patch("database.get_user_sap_credential", return_value={"username": "test-user", "password": "x"}), \
         patch("database.get_user_sap_token", return_value=None), \
         patch("database.list_user_sap_credentials", return_value=[]), \
         patch("agent._buat_llm", return_value=None):
        asyncio.run(process_chat(chat_req=req, user_role="user", username="test-user"))

    assert "args" in captured, "get_all_tools must be called"
    server_filter, allowed_conn = captured["args"]
    assert allowed_conn == {"sap", "sql"}, f"allowed_conn={allowed_conn}"
    assert "sandbox-new" in server_filter
