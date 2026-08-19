from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import logging

logger = logging.getLogger(__name__)

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
    get_chat_messages,
    list_all_users,
    create_new_user,
    update_user_by_admin,
    delete_user_by_admin,
    get_admin_system_stats,
    get_all_sessions_for_audit
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
    try:
        init_db()
    except Exception as e:
        logger.error(f"Startup DB init failed (server will still run): {e}")

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
    mcp_sap_config_json: str = None
    mcp_rag_config_json: str = None
    nine_router_enabled: bool = None
    nine_router_base_url: str = None
    nine_router_model: str = None
    nine_router_api_key: str = None
    openrouter_enabled: bool = None
    openrouter_model: str = None
    openrouter_fallback_model: str = None
    openrouter_api_key: str = None
    assistant_persona: str = ""

@app.get("/api/config")
async def get_config(request: Request):
    username = request.headers.get("X-User-Name", "Guest")
    user = get_user_by_username(username)
    if not user:
        user = {"username": username, "role": "user", "assistant_persona": ""}
        
    sys_cfg = get_system_config()
    return {
        "mcp_sap_config_json": sys_cfg.get("mcp_sap_config_json", ""),
        "mcp_rag_config_json": sys_cfg.get("mcp_rag_config_json", ""),
        "nine_router_enabled": sys_cfg.get("nine_router_enabled", True),
        "nine_router_base_url": sys_cfg.get("nine_router_base_url", "http://192.168.88.83:20128/v1"),
        "nine_router_model": sys_cfg.get("nine_router_model", "ag/gemini-3.7-flash-medium"),
        "nine_router_api_key": sys_cfg.get("nine_router_api_key", ""),
        "openrouter_enabled": sys_cfg.get("openrouter_enabled", False),
        "openrouter_model": sys_cfg.get("openrouter_model", "openrouter/auto"),
        "openrouter_fallback_model": sys_cfg.get("openrouter_fallback_model", "openrouter/free"),
        "openrouter_api_key": sys_cfg.get("openrouter_api_key", ""),
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
        
    if config.assistant_persona is not None:
        update_user_persona(username, config.assistant_persona)
    
    if user["role"] == "superadmin":
        update_system_config(
            mcp_sap_json=config.mcp_sap_config_json,
            mcp_rag_json=config.mcp_rag_config_json,
            nine_router_enabled=config.nine_router_enabled,
            nine_router_base_url=config.nine_router_base_url,
            nine_router_model=config.nine_router_model,
            nine_router_api_key=config.nine_router_api_key,
            openrouter_enabled=config.openrouter_enabled,
            openrouter_model=config.openrouter_model,
            openrouter_fallback_model=config.openrouter_fallback_model,
            openrouter_api_key=config.openrouter_api_key
        )
        
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
@app.get("/api/history/{session_id}")
async def get_session_messages_endpoint(session_id: str, request: Request):
    username = request.headers.get("X-User-Name", "Guest")
    if username == "Guest" or not session_id or session_id == "undefined":
        return []
    return get_chat_messages(session_id)

@app.get("/api/mcp/servers")
async def get_mcp_servers():
    """
    Endpoint untuk mengambil daftar & status live server MCP yang terkonfigurasi.
    """
    status = await mcp_manager.check_servers_status()
    return status

# --- SUPER ADMIN ENDPOINTS ---

def require_superadmin(request: Request):
    """Dependency helper untuk memvalidasi hak akses superadmin."""
    username = request.headers.get("X-User-Name", "Guest")
    if username == "Guest":
        raise HTTPException(status_code=401, detail="Pengguna belum terautentikasi.")
    
    user = get_user_by_username(username)
    if not user or user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak. Fitur ini hanya untuk Super Admin.")
    return user

@app.get("/api/admin/stats")
async def get_admin_stats_endpoint(request: Request):
    """Mengambil metrik statistik sistem & status live MCP servers."""
    require_superadmin(request)
    stats = get_admin_system_stats()
    mcp_status = await mcp_manager.check_servers_status()
    stats["mcp_status"] = mcp_status
    return stats

@app.get("/api/admin/users")
async def get_admin_users_endpoint(request: Request):
    """Mendapatkan daftar semua user yang ada di sistem."""
    require_superadmin(request)
    return list_all_users()

class AdminCreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    assistant_persona: str = ""

@app.post("/api/admin/users")
async def create_user_endpoint(request: Request, req: AdminCreateUserRequest):
    """Membuat user baru (oleh Super Admin)."""
    require_superadmin(request)
    if not req.username or not req.password:
        raise HTTPException(status_code=400, detail="Username dan password wajib diisi.")
    
    res = create_new_user(
        username=req.username.strip(), 
        password=req.password, 
        role=req.role, 
        persona=req.assistant_persona
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res

class AdminUpdateUserRequest(BaseModel):
    role: str = None
    assistant_persona: str = None
    password: str = None

@app.put("/api/admin/users/{username}")
async def update_user_endpoint(username: str, request: Request, req: AdminUpdateUserRequest):
    """Memperbarui user (role, persona, atau reset password)."""
    current_admin = require_superadmin(request)
    
    # Pencegahan Super Admin menghapus hak superadmin dirinya sendiri secara tidak sengaja
    if current_admin["username"] == username and req.role and req.role != "superadmin":
        raise HTTPException(status_code=400, detail="Anda tidak dapat menurunkan role akun superadmin yang sedang Anda gunakan.")
        
    res = update_user_by_admin(
        username=username, 
        password=req.password if req.password else None, 
        role=req.role, 
        persona=req.assistant_persona
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res

@app.delete("/api/admin/users/{username}")
async def delete_user_endpoint(username: str, request: Request):
    """Menghapus user tertentu."""
    current_admin = require_superadmin(request)
    if current_admin["username"] == username:
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus akun Anda sendiri.")
        
    res = delete_user_by_admin(username)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res

@app.get("/api/admin/sessions")
async def get_admin_all_sessions_endpoint(request: Request, limit: int = 50):
    """Audit log: Mengambil seluruh sesi percakapan dari semua user."""
    require_superadmin(request)
    return get_all_sessions_for_audit(limit=limit)

@app.get("/api/admin/sessions/{session_id}/messages")
async def get_admin_session_messages_endpoint(session_id: str, request: Request):
    """Audit log: Mengambil riwayat pesan percakapan spesifik tanpa batasan user."""
    require_superadmin(request)
    return get_chat_messages(session_id)

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
                chat_req.session_id = active_session_id

        # Simpan pesan dari user ke DB
        if active_session_id:
            add_chat_message(active_session_id, "user", chat_req.message)

    # Pastikan riwayat percakapan (session context) terisi lengkap dari Database jika history kosong di request
    if active_session_id and not chat_req.history:
        raw_msgs = get_chat_messages(active_session_id)
        # Ambil pesan-pesan sebelum pesan user yang baru saja disimpan
        db_history = []
        for m in raw_msgs[:-1] if username != "Guest" else raw_msgs:
            role_val = "assistant" if m["role"] in ("ai", "assistant") else "user"
            db_history.append({
                "role": role_val,
                "content": m["content"]
            })
        if db_history:
            # Ambil maksimal 12 pesan terakhir untuk efisiensi context window
            chat_req.history = db_history[-12:]
            logger.info(f"Dimuat {len(chat_req.history)} pesan histori dari session {active_session_id} untuk konteks percakapan.")

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