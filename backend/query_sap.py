import asyncio
import json
import httpx

SAP_URL = "http://192.168.1.162:8091/mcp"
RAG_URL = "http://192.168.1.162:8090/mcp"
HEADERS = {
    "Authorization": "Bearer Trias123",
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
}

class MCPHttpClient:
    def __init__(self, url: str):
        self.url = url
        self.session_id = None

    async def init(self, client: httpx.AsyncClient):
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "sap-ai-assistant", "version": "1.0.0"}
            }
        }
        res = await client.post(self.url, headers=HEADERS, json=init_payload, timeout=10.0)
        self.session_id = res.headers.get("mcp-session-id")
        
        # Send initialized notification
        headers = dict(HEADERS)
        if self.session_id:
            headers["mcp-session-id"] = self.session_id
        await client.post(self.url, headers=headers, json={"jsonrpc": "2.0", "method": "notifications/initialized"}, timeout=5.0)

    async def call_tool(self, client: httpx.AsyncClient, tool_name: str, args: dict, req_id: int = 2):
        headers = dict(HEADERS)
        if self.session_id:
            headers["mcp-session-id"] = self.session_id
            
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": args
            }
        }
        res = await client.post(self.url, headers=headers, json=payload, timeout=30.0)
        return res.json()

async def main():
    async with httpx.AsyncClient() as client:
        sap = MCPHttpClient(SAP_URL)
        rag = MCPHttpClient(RAG_URL)
        
        await sap.init(client)
        await rag.init(client)
        
        print("--- Step 1: List SAP Servers ---")
        servers_res = await sap.call_tool(client, "list_servers", {})
        print("SAP Servers:", json.dumps(servers_res, indent=2))
        
        print("\n--- Step 2: Set Active Server to sandbox-new / TRS ---")
        set_srv_res = await sap.call_tool(client, "set_active_server", {"server_ref": "sandbox-new"})
        print("Set Server Response:", json.dumps(set_srv_res, indent=2))
        
        print("\n--- Step 3: Query MARC table for material SRRPAI ---")
        # Field MARC: MATNR, WERKS
        marc_res = await sap.call_tool(client, "read_table", {
            "table": "MARC",
            "fields": ["MATNR", "WERKS"],
            "where": ["MATNR LIKE '%SRRPAI%'"],
            "rowcount": 50
        })
        print("MARC Query Result:", json.dumps(marc_res, indent=2))

        print("\n--- Step 4: Query RAG for material / plant info ---")
        rag_res = await rag.call_tool(client, "rag_search", {
            "query": "SRRPAI plant material",
            "top_k": 3
        })
        print("RAG Query Result:", json.dumps(rag_res, indent=2))

if __name__ == "__main__":
    asyncio.run(main())