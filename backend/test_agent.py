import asyncio
import json
from agent import process_chat
from models import ChatRequest

async def test():
    req = ChatRequest(
        message="Coba cek data material SRRPAI ada di plant mana saja di SAP?",
        history=[]
    )
    print("Sending chat request to agent...")
    res = await process_chat(req, user_role="Planner / User SAP")
    print("\n--- AGENT RESPONSE ---")
    print(res.reply)
    print("\n--- SOURCES ---")
    for s in res.sources:
        print(f"[{s.type}] {s.name}")

if __name__ == "__main__":
    asyncio.run(test())