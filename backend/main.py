from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os

from models import ChatRequest, ChatResponse, SourceReference
from config import settings
from agent import process_chat
from mcp_manager import mcp_manager
from database import (
    init_db, 
    authenticate_user, 
    get_user_by_username, 
    update_user_persona, 
    get_system_config, 
    update_system_config,
    change_user_password,
    create_chat_session,
    get_chat_sessions,
    delete_chat_session,
    add_chat_message,
    get_chat_messages
)

app = FastAPI(title="Enterprise SAP Chat Assistant")

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Inisialisasi database schema & default user saat server dinyalakan."""
    init_db()

@app.get("/")
async def root():
    """Redirect ke halaman dokumentasi API (Swagger UI)."""
    return RedirectResponse(url="/docs")

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/login")
async def login(req: LoginRequest):
    """Endpoint autentikasi user."""
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Username atau password salah")
    return {
        "status": "success",
        "username": user["username"],
        "role": user["role"],
        "assistant_persona": user["assistant_persona"]
    }

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

@app.post("/api/change-password")
async def change_password_endpoint(request: Request, req: ChangePasswordRequest):
    """Endpoint untuk mengubah password user yang sedang login."""
    username = request.headers.get("X-User-Name")
    if not username or username == "Guest":
        raise HTTPException(status_code=401, detail="Pengguna tidak terautentikasi.")
    
    res = change_user_password(username, req.old_password, req.new_password)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res

class ConfigUpdate(BaseModel):
    mcp_sap_config_json: str = ""
    mcp_rag_config_json: str = ""
    assistant_persona: str = ""

@app.get("/api/config")
async def get_config(request: Request):
    username = request.headers.get("X-User-Name", "Guest")
    user = get_user_by_username(username)
    if not user:
        user = {"username": username, "role": "user", "assistant_persona": ""}
        
    sys_cfg = get_system_config()
    return {
        "mcp_sap_config_json": sys_cfg["mcp_sap_config_json"],
        "mcp_rag_config_json": sys_cfg["mcp_rag_config_json"],
        "assistant_persona": user["assistant_persona"],
        "role": user["role"]
    }

@app.post("/api/config")
async def update_config(request: Request, config: ConfigUpdate):
    username = request.headers.get("X-User-Name", "Guest")
    if username == "Guest":
        raise HTTPException(status_code=401, detail="Guest tidak dapat menyimpan pengaturan.")

    user = get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
        
    update_user_persona(username, config.assistant_persona)
    
    if user["role"] == "superadmin":
        update_system_config(config.mcp_sap_config_json, config.mcp_rag_config_json)
        
    return {"status": "success"}

# --- CHAT SESSIONS & HISTORY ENDPOINTS ---

class CreateSessionRequest(BaseModel):
    title: str = "Percakapan Baru"

@app.get("/api/sessions")
async def get_sessions_endpoint(request: Request):
    username = request.headers.get("X-User-Name", "Guest")
    if username == "Guest":
        return []
    return get_chat_sessions(username)

@app.post("/api/sessions")
async def create_session_endpoint(request: Request, req: CreateSessionRequest):
    username = request.headers.get("X-User-Name", "Guest")
    if username == "Guest":
        raise HTTPException(status_code=401, detail="Guest tidak dapat membuat session di database.")
    session = create_chat_session(username, req.title)
    if not session:
        raise HTTPException(status_code=500, detail="Gagal membuat sesi percakapan.")
    return session

@app.delete("/api/sessions/{session_id}")
async def delete_session_endpoint(session_id: str, request: Request):
    username = request.headers.get("X-User-Name", "Guest")
    if username == "Guest":
        raise HTTPException(status_code=401, detail="Unauthorized")
    success = delete_chat_session(session_id, username)
    return {"status": "success" if success else "failed"}

@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages_endpoint(session_id: str, request: Request):
    username = request.headers.get("X-User-Name", "Guest")
    if username == "Guest":
        return []
    return get_chat_messages(session_id)

@app.get("/api/mcp/servers")
async def get_mcp_servers():
    """
    Endpoint untuk mengambil daftar & status live server MCP yang terkonfigurasi.
    """
    status = await mcp_manager.check_servers_status()
    return status

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request, chat_req: ChatRequest):
    """
    Endpoint utama untuk memproses chat dari user.
    """
    username = request.headers.get("X-User-Name", "Guest")
    user = get_user_by_username(username) if username != "Guest" else None
    
    if not user:
        user_role = request.headers.get("X-User-Role", "user")
        user_persona = ""
    else:
        user_role = user["role"]
        user_persona = user["assistant_persona"]

    active_session_id = chat_req.session_id

    # Jika user sudah login dan belum ada session_id yang aktif, buatkan sesi baru secara otomatis
    if username != "Guest":
        if not active_session_id:
            new_session = create_chat_session(username, title="Percakapan Baru")
            if new_session:
                active_session_id = new_session["session_id"]

        # Simpan pesan dari user ke DB
        if active_session_id:
            add_chat_message(active_session_id, "user", chat_req.message)

    # Proses respons dengan agent AI
    response = await process_chat(chat_req, user_role, user_persona)

    # Jika user sudah login, simpan balasan AI ke DB
    if username != "Guest" and active_session_id:
        sources_str = json.dumps([s.dict() for s in response.sources]) if response.sources else ""
        add_chat_message(active_session_id, "ai", response.reply, sources_str)

    response.session_id = active_session_id
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)