from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel
import os
from dotenv import set_key

from models import ChatRequest, ChatResponse, SourceReference
from config import settings
from agent import process_chat

app = FastAPI(title="Enterprise SAP Chat Assistant")

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# No clients instantiation needed here; they are managed by MCPManager in agent.py

@app.get("/")
async def root():
    """Redirect ke halaman dokumentasi API (Swagger UI)."""
    return RedirectResponse(url="/docs")

# RBAC Middleware simulation
@app.middleware("http")
async def rbac_middleware(request: Request, call_next):
    # Skip RBAC for non-API endpoints if any (like docs)
    if not request.url.path.startswith("/api/"):
        return await call_next(request)
        
    user_role = request.headers.get("X-User-Role", "Guest")
    # Add role to state for access in endpoints
    request.state.user_role = user_role
    
    # Example logic: Guests are not allowed
    if user_role == "Guest":
        pass
        
    response = await call_next(request)
    return response

class ConfigUpdate(BaseModel):
    mcp_sap_config_json: str
    mcp_rag_config_json: str
    openrouter_api_key: str
    assistant_persona: str = ""

@app.get("/api/config")
async def get_config():
    return {
        "mcp_sap_config_json": settings.mcp_sap_config_json,
        "mcp_rag_config_json": settings.mcp_rag_config_json,
        "openrouter_api_key": settings.openrouter_api_key,
        "assistant_persona": settings.assistant_persona,
    }

@app.post("/api/config")
async def update_config(config: ConfigUpdate):
    settings.mcp_sap_config_json = config.mcp_sap_config_json
    settings.mcp_rag_config_json = config.mcp_rag_config_json
    settings.openrouter_api_key = config.openrouter_api_key
    settings.assistant_persona = config.assistant_persona
    
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        open(env_path, 'a').close()
        
    set_key(env_path, "MCP_SAP_CONFIG_JSON", config.mcp_sap_config_json)
    set_key(env_path, "MCP_RAG_CONFIG_JSON", config.mcp_rag_config_json)
    set_key(env_path, "OPENROUTER_API_KEY", config.openrouter_api_key)
    set_key(env_path, "ASSISTANT_PERSONA", config.assistant_persona)
    
    return {"status": "success"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request, chat_req: ChatRequest):
    """
    Endpoint utama untuk memproses chat dari user.
    """
    user_role = getattr(request.state, "user_role", "Guest")
    
    if user_role == "Guest":
        raise HTTPException(status_code=403, detail="Akses ditolak. Role tidak valid.")
        
    return await process_chat(chat_req, user_role)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
