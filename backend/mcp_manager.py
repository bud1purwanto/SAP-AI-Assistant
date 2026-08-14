import asyncio
import logging
import json
import httpx
from config import settings

logger = logging.getLogger(__name__)

class MCPTool:
    def __init__(self, name: str, description: str = "", input_schema: dict = None):
        self.name = name
        self.description = description
        self.inputSchema = input_schema or {}

class MCPContentItem:
    def __init__(self, text: str, type_: str = "text"):
        self.type = type_
        self.text = text

class MCPCallResult:
    def __init__(self, content: list[MCPContentItem], is_error: bool = False):
        self.content = content
        self.isError = is_error

class StreamableHttpClient:
    def __init__(self, name: str, url: str, headers: dict):
        self.name = name
        self.url = url
        self.headers = dict(headers or {})
        self.headers.setdefault("Content-Type", "application/json")
        self.headers.setdefault("Accept", "application/json, text/event-stream")
        self.session_id = None
        self._initialized = False

    async def initialize(self, client: httpx.AsyncClient):
        if self._initialized:
            return

        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": f"client-{self.name}", "version": "1.0.0"}
            }
        }
        res = await client.post(self.url, headers=self.headers, json=init_payload, timeout=10.0)
        res.raise_for_status()
        self.session_id = res.headers.get("mcp-session-id")
        
        headers_with_session = dict(self.headers)
        if self.session_id:
            headers_with_session["mcp-session-id"] = self.session_id
            
        await client.post(
            self.url,
            headers=headers_with_session,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            timeout=5.0
        )
        self._initialized = True
        logger.info(f"[{self.name}] Streamable HTTP MCP client initialized successfully.")

        # Auto-set active server to sandbox-new for SAP server
        if self.name == "sap":
            try:
                logger.info("[sap] Auto-setting active SAP server to 'sandbox-new'...")
                await self.call_tool(client, "set_active_server", {"server_ref": "sandbox-new"})
            except Exception as e:
                logger.warning(f"[sap] Failed to auto-set active server to sandbox-new: {e}")

    async def list_tools(self, client: httpx.AsyncClient) -> list[MCPTool]:
        await self.initialize(client)
        headers = dict(self.headers)
        if self.session_id:
            headers["mcp-session-id"] = self.session_id
            
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        res = await client.post(self.url, headers=headers, json=payload, timeout=15.0)
        res.raise_for_status()
        data = res.json()
        
        tools_list = []
        raw_tools = data.get("result", {}).get("tools", [])
        for item in raw_tools:
            tools_list.append(MCPTool(
                name=item.get("name", ""),
                description=item.get("description", ""),
                input_schema=item.get("inputSchema", {})
            ))
        return tools_list

    async def call_tool(self, client: httpx.AsyncClient, tool_name: str, arguments: dict) -> MCPCallResult:
        await self.initialize(client)
        headers = dict(self.headers)
        if self.session_id:
            headers["mcp-session-id"] = self.session_id

        payload = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        res = await client.post(self.url, headers=headers, json=payload, timeout=45.0)
        res.raise_for_status()
        data = res.json()
        
        if "error" in data:
            err_msg = json.dumps(data["error"])
            return MCPCallResult(content=[MCPContentItem(text=err_msg)], is_error=True)

        result_obj = data.get("result", {})
        is_error = result_obj.get("isError", False)
        raw_content = result_obj.get("content", [])

        content_items = []
        if isinstance(raw_content, list):
            for c in raw_content:
                if isinstance(c, dict):
                    content_items.append(MCPContentItem(text=c.get("text", json.dumps(c)), type_=c.get("type", "text")))
                else:
                    content_items.append(MCPContentItem(text=str(c)))
        else:
            content_items.append(MCPContentItem(text=json.dumps(result_obj)))

        return MCPCallResult(content=content_items, is_error=is_error)


class MCPManager:
    def __init__(self):
        self.clients: dict[str, StreamableHttpClient] = {}

    def _get_client_config(self, name: str) -> tuple[str, dict]:
        if name == "sap":
            config_json_str = settings.mcp_sap_config_json
            if not config_json_str:
                # Default fallback jika env var belum ter-load sempurna
                return "http://192.168.1.162:8091/mcp", {"Authorization": "Bearer Trias123"}
            config = json.loads(config_json_str)
            mcp_servers = config.get("mcpServers", {})
            sap_config = list(mcp_servers.values())[0]
            return sap_config.get("url"), sap_config.get("headers", {})
        elif name == "rag":
            config_json_str = settings.mcp_rag_config_json
            if not config_json_str:
                # Default fallback jika env var belum ter-load sempurna
                return "http://192.168.1.162:8090/mcp", {"Authorization": "Bearer Trias123"}
            config = json.loads(config_json_str)
            rag_config = config.get("mcpServers", {}).get("manufacturing-rag", {})
            return rag_config.get("url"), rag_config.get("headers", {})
        else:
            raise ValueError(f"Unknown MCP server name: {name}")

    def get_client(self, name: str) -> StreamableHttpClient:
        url, headers = self._get_client_config(name)
        if name not in self.clients or self.clients[name].url != url or self.clients[name].headers != headers:
            self.clients[name] = StreamableHttpClient(name=name, url=url, headers=headers)
        return self.clients[name]

    async def get_all_tools(self) -> list[dict]:
        tools = []
        async with httpx.AsyncClient() as http_client:
            # SAP Tools
            try:
                sap_client = self.get_client("sap")
                sap_tools = await sap_client.list_tools(http_client)
                for t in sap_tools:
                    tools.append({"server": "sap", "tool": t})
            except Exception as e:
                logger.error(f"Error fetching SAP tools: {e}")

            # RAG Tools
            try:
                rag_client = self.get_client("rag")
                rag_tools = await rag_client.list_tools(http_client)
                for t in rag_tools:
                    tools.append({"server": "rag", "tool": t})
            except Exception as e:
                logger.error(f"Error fetching RAG tools: {e}")

        return tools

    async def call_tool(self, server_name: str, tool_name: str, arguments: dict) -> MCPCallResult:
        async with httpx.AsyncClient() as http_client:
            client = self.get_client(server_name)
            return await client.call_tool(http_client, tool_name, arguments)

mcp_manager = MCPManager()