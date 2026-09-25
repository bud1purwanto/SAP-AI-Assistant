import asyncio
from unittest.mock import patch, AsyncMock
from mcp_manager import MCPManager


class FakeTool:
    def __init__(self, name):
        self.name = name
        self.description = f"tool {name}"
        self.inputSchema = {"type": "object"}


class FakeClient:
    def __init__(self, names):
        self._names = names

    async def list_tools(self, http_client, force_refresh=False):
        return [FakeTool(n) for n in self._names]


def test_sap_and_sql_simultaneous():
    m = MCPManager()
    fake = {
        "sap": FakeClient(["read_table"]),
        "sql": FakeClient(["sql_run_query"]),
        "rag": FakeClient(["rag_search"]),
        "email": FakeClient(["search_emails"]),
    }
    with patch.object(m, "get_client", side_effect=lambda name: fake[name]), \
         patch.object(m, "get_live_resources", new=AsyncMock(return_value=[])):
        # Bahkan bila server_filter membawa prefix 'sap:sandbox-new',
        # jika allowed_connectors mengandung 'sql', sql tetap dimuat!
        tools = asyncio.run(m.get_all_tools(server_filter="sap:sandbox-new", allowed_connectors={"sap", "sql"}))
    servers = {t["server"] for t in tools}
    assert "sap" in servers, "SAP tools must be present"
    assert "sql" in servers, "SQL tools must be present simultaneously"
    assert "rag" not in servers, "RAG must be excluded if not in allowed_connectors"
    assert "email" not in servers, "Email must be excluded if not in allowed_connectors"


def test_all_connectors_enabled():
    m = MCPManager()
    fake = {
        "sap": FakeClient(["read_table"]),
        "sql": FakeClient(["sql_run_query"]),
        "rag": FakeClient(["rag_search"]),
        "email": FakeClient(["search_emails"]),
    }
    with patch.object(m, "get_client", side_effect=lambda name: fake[name]), \
         patch.object(m, "get_live_resources", new=AsyncMock(return_value=[])):
        tools = asyncio.run(m.get_all_tools(server_filter="all", allowed_connectors={"sap", "sql", "rag", "email"}))
    servers = {t["server"] for t in tools}
    assert servers == {"sap", "sql", "rag", "email"}
