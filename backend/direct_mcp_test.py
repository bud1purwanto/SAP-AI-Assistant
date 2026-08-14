import asyncio
import json
import httpx

RAG_URL = "http://192.168.1.162:8090/mcp"
SAP_URL = "http://192.168.1.162:8091/mcp"
HEADERS = {
    "Authorization": "Bearer Trias123",
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
}

async def full_mcp_test():
    async with httpx.AsyncClient() as client:
        # Initialize SAP
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "python-client", "version": "1.0.0"}
            }
        }
        
        print("=== SAP INITIALIZE ===")
        r_sap_init = await client.post(SAP_URL, headers=HEADERS, json=init_payload, timeout=10.0)
        print("SAP Init Status:", r_sap_init.status_code)
        print("SAP Init Response:", r_sap_init.text)
        
        mcp_session_id = r_sap_init.headers.get("mcp-session-id")
        headers_with_session = dict(HEADERS)
        if mcp_session_id:
            headers_with_session["mcp-session-id"] = mcp_session_id

        # Initialized notification
        notif_payload = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        await client.post(SAP_URL, headers=headers_with_session, json=notif_payload, timeout=5.0)

        # List Tools for SAP
        tools_payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        print("\n=== SAP LIST TOOLS ===")
        r_sap_tools = await client.post(SAP_URL, headers=headers_with_session, json=tools_payload, timeout=10.0)
        print("SAP Tools Response:", r_sap_tools.text)

        # List Tools for RAG
        print("\n=== RAG LIST TOOLS ===")
        r_rag_init = await client.post(RAG_URL, headers=HEADERS, json=init_payload, timeout=10.0)
        rag_session_id = r_rag_init.headers.get("mcp-session-id")
        rag_headers = dict(HEADERS)
        if rag_session_id:
            rag_headers["mcp-session-id"] = rag_session_id
            
        await client.post(RAG_URL, headers=rag_headers, json=notif_payload, timeout=5.0)
        r_rag_tools = await client.post(RAG_URL, headers=rag_headers, json=tools_payload, timeout=10.0)
        print("RAG Tools Response:", r_rag_tools.text)

if __name__ == "__main__":
    asyncio.run(full_mcp_test())