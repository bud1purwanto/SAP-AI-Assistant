import asyncio
from mcp_manager import mcp_manager

async def main():
    try:
        print("Fetching tools...")
        tools = await mcp_manager.get_all_tools()
        print(f"Found {len(tools)} tools:")
        for t in tools:
            print(t["server"], t["tool"].name)
    except Exception as e:
        print(f"Failed to fetch tools: {e}")

if __name__ == "__main__":
    asyncio.run(main())
