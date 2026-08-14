import asyncio
from fastapi import Request
from main import app, chat_endpoint
from models import ChatRequest

async def test():
    req = Request({"type": "http", "method": "POST", "headers": []})
    req.state.user_role = "IT"
    chat_req = ChatRequest(message="tes", history=[])
    try:
        res = await chat_endpoint(req, chat_req)
        print(res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(test())
