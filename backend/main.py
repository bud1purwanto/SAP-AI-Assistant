import json
import logging
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel

from agent import process_chat
from artifacts import get_artifact
from auth import (
    create_access_token,
    get_current_user,
    get_current_user_optional,
)
from auth import require_superadmin as require_superadmin_token
from config import settings, _EPHEMERAL_JWT_SECRET
from database import (
    add_chat_message,
    authenticate_user,
    change_user_password,
    consume_guest_quota,
    create_chat_session,
    create_new_user,
    delete_chat_session,
    delete_user_by_admin,
    get_admin_system_stats,
    get_all_sessions_for_audit,
    get_chat_messages,
    get_chat_sessions,
    get_system_config,
    get_user_by_username,
    init_db,
    list_all_users,
    session_belongs_to,
    update_system_config,
    update_user_by_admin,
    update_user_full_name,
    update_user_persona,
)
from mcp_manager import mcp_manager
from models import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inisialisasi database schema & user bootstrap saat server dinyalakan."""
    if _EPHEMERAL_JWT_SECRET:
        logger.warning(
            "JWT_SECRET tidak diset — memakai secret acak sementara. Semua sesi login "
            "akan gugur setiap restart dan tidak konsisten antar worker. "
            "Set JWT_SECRET di .env untuk produksi."
        )
    try:
        init_db()
    except Exception as e:
        if settings.require_postgres:
            raise
        logger.error(f"Startup DB init failed (server will still run): {e}")
    yield


app = FastAPI(title="Enterprise SAP Chat Assistant", lifespan=lifespan)

# CORS: origin dibatasi lewat CORS_ALLOW_ORIGINS. Kredensial hanya diaktifkan
# bila origin spesifik, karena "*" + credentials ditolak browser.
_origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_superadmin(user: dict = Depends(require_superadmin_token)) -> dict:
    """Verifikasi ulang role terhadap database.

    Token menyimpan role saat login; pemeriksaan ulang ini memastikan
    pencabutan hak akses langsung berlaku tanpa menunggu token kedaluwarsa.
    """
    fresh = get_user_by_username(user["username"])
    if not fresh or fresh.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Akses ditolak. Fitur ini hanya untuk Super Admin.")
    return fresh


def _mask_secret(value: str) -> str:
    """Samarkan kredensial agar tidak dikirim utuh ke browser."""
    if not value:
        return ""
    if len(value) <= 8:
        return "••••••••"
    return f"{value[:4]}••••{value[-4:]}"


@app.get("/")
async def root():
    """Redirect ke halaman dokumentasi API (Swagger UI)."""
    return RedirectResponse(url="/docs")


@app.get("/healthz")
async def healthz():
    """Health check ringan untuk load balancer / monitoring."""
    return {"status": "ok"}


# --- AUTENTIKASI ---

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/login")
async def login(req: LoginRequest):
    """Endpoint autentikasi user. Mengembalikan access token JWT."""
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Username atau password salah")

    token = create_access_token(user["username"], user["role"])
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_minutes * 60,
        "username": user["username"],
        "full_name": user.get("full_name", ""),
        "role": user["role"],
        "assistant_persona": user["assistant_persona"],
    }


@app.get("/api/me")
async def me(user: dict = Depends(get_current_user)):
    """Kembalikan profil user dari token — dipakai frontend untuk validasi sesi."""
    fresh = get_user_by_username(user["username"])
    if not fresh:
        raise HTTPException(status_code=401, detail="User tidak ditemukan.")
    return fresh


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@app.post("/api/change-password")
async def change_password_endpoint(
    req: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
):
    """Endpoint untuk mengubah password user yang sedang login."""
    res = change_user_password(user["username"], req.old_password, req.new_password)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res


# --- KONFIGURASI ---

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
    full_name: str = None
    global_assistant_persona: str = None


@app.get("/api/config")
async def get_config(user: dict = Depends(get_current_user)):
    profile = get_user_by_username(user["username"])
    if not profile:
        raise HTTPException(status_code=401, detail="User tidak ditemukan.")

    sys_cfg = get_system_config()
    is_admin = profile["role"] == "superadmin"

    payload = {
        "assistant_persona": profile["assistant_persona"],
        "full_name": profile.get("full_name", ""),
        "role": profile["role"],
        # Persona organisasi ditampilkan (baca-saja bagi non-admin) agar user
        # memahami dasar perilaku asisten sebelum menambah preferensi pribadi.
        "global_assistant_persona": sys_cfg.get("global_assistant_persona", ""),
    }

    # Konfigurasi sistem (termasuk endpoint internal) hanya untuk superadmin.
    if is_admin:
        payload.update({
            "mcp_sap_config_json": sys_cfg.get("mcp_sap_config_json", ""),
            "mcp_rag_config_json": sys_cfg.get("mcp_rag_config_json", ""),
            "nine_router_enabled": sys_cfg.get("nine_router_enabled", True),
            "nine_router_base_url": sys_cfg.get("nine_router_base_url", ""),
            "nine_router_model": sys_cfg.get("nine_router_model", ""),
            "openrouter_enabled": sys_cfg.get("openrouter_enabled", False),
            "openrouter_model": sys_cfg.get("openrouter_model", ""),
            "openrouter_fallback_model": sys_cfg.get("openrouter_fallback_model", ""),
            # API key tidak pernah dikirim utuh; frontend hanya perlu tahu
            # apakah sudah terisi dan mengirim nilai baru saat diganti.
            "nine_router_api_key": _mask_secret(sys_cfg.get("nine_router_api_key", "")),
            "nine_router_api_key_set": bool(sys_cfg.get("nine_router_api_key")),
            "openrouter_api_key": _mask_secret(sys_cfg.get("openrouter_api_key", "")),
            "openrouter_api_key_set": bool(sys_cfg.get("openrouter_api_key")),
        })

    return payload


@app.post("/api/config")
async def update_config(config: ConfigUpdate, user: dict = Depends(get_current_user)):
    profile = get_user_by_username(user["username"])
    if not profile:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    if config.assistant_persona is not None:
        update_user_persona(profile["username"], config.assistant_persona)

    if config.full_name is not None:
        update_user_full_name(profile["username"], config.full_name)

    if profile["role"] == "superadmin":
        # Nilai bertanda mask berarti field tidak diubah user — jangan timpa.
        nine_key = config.nine_router_api_key
        if nine_key and "••••" in nine_key:
            nine_key = None
        open_key = config.openrouter_api_key
        if open_key and "••••" in open_key:
            open_key = None

        update_system_config(
            mcp_sap_json=config.mcp_sap_config_json,
            mcp_rag_json=config.mcp_rag_config_json,
            nine_router_enabled=config.nine_router_enabled,
            nine_router_base_url=config.nine_router_base_url,
            nine_router_model=config.nine_router_model,
            nine_router_api_key=nine_key,
            openrouter_enabled=config.openrouter_enabled,
            openrouter_model=config.openrouter_model,
            openrouter_fallback_model=config.openrouter_fallback_model,
            openrouter_api_key=open_key,
            global_assistant_persona=config.global_assistant_persona,
        )

    return {"status": "success"}


# --- CHAT SESSIONS & HISTORY ENDPOINTS ---

class CreateSessionRequest(BaseModel):
    title: str = "Percakapan Baru"


@app.get("/api/sessions")
async def get_sessions_endpoint(user: dict = Depends(get_current_user)):
    return get_chat_sessions(user["username"])


@app.post("/api/sessions")
async def create_session_endpoint(
    req: CreateSessionRequest,
    user: dict = Depends(get_current_user),
):
    session = create_chat_session(user["username"], req.title)
    if not session:
        raise HTTPException(status_code=500, detail="Gagal membuat sesi percakapan.")
    return session


@app.delete("/api/sessions/{session_id}")
async def delete_session_endpoint(session_id: str, user: dict = Depends(get_current_user)):
    success = delete_chat_session(session_id, user["username"])
    if not success:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan.")
    return {"status": "success"}


@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages_endpoint(session_id: str, user: dict = Depends(get_current_user)):
    """Riwayat pesan satu sesi, dibatasi pada sesi milik user yang meminta."""
    if not session_id or session_id == "undefined":
        return []
    return get_chat_messages(session_id, username=user["username"])


@app.get("/api/mcp/servers")
async def get_mcp_servers():
    """Daftar & status live server MCP yang terkonfigurasi."""
    return await mcp_manager.check_servers_status()


# --- SUPER ADMIN ENDPOINTS ---

@app.get("/api/admin/stats")
async def get_admin_stats_endpoint(admin: dict = Depends(require_superadmin)):
    """Mengambil metrik statistik sistem & status live MCP servers."""
    stats = get_admin_system_stats()
    stats["mcp_status"] = await mcp_manager.check_servers_status()
    return stats


@app.get("/api/admin/users")
async def get_admin_users_endpoint(admin: dict = Depends(require_superadmin)):
    """Mendapatkan daftar semua user yang ada di sistem."""
    return list_all_users()


class AdminCreateUserRequest(BaseModel):
    username: str
    password: str
    full_name: str = ""
    role: str = "user"
    assistant_persona: str = ""


@app.post("/api/admin/users")
async def create_user_endpoint(
    req: AdminCreateUserRequest,
    admin: dict = Depends(require_superadmin),
):
    """Membuat user baru (oleh Super Admin)."""
    if not req.username or not req.password:
        raise HTTPException(status_code=400, detail="Username dan password wajib diisi.")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password minimal 8 karakter.")
    if req.role not in ("user", "superadmin"):
        raise HTTPException(status_code=400, detail="Role tidak dikenal.")

    res = create_new_user(
        username=req.username.strip(),
        password=req.password,
        role=req.role,
        persona=req.assistant_persona,
        full_name=req.full_name,
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res


class AdminUpdateUserRequest(BaseModel):
    role: str = None
    assistant_persona: str = None
    password: str = None
    full_name: str = None


@app.put("/api/admin/users/{username}")
async def update_user_endpoint(
    username: str,
    req: AdminUpdateUserRequest,
    admin: dict = Depends(require_superadmin),
):
    """Memperbarui user (role, persona, atau reset password)."""
    if admin["username"].lower() == username.lower() and req.role and req.role != "superadmin":
        raise HTTPException(
            status_code=400,
            detail="Anda tidak dapat menurunkan role akun superadmin yang sedang Anda gunakan.",
        )
    if req.role and req.role not in ("user", "superadmin"):
        raise HTTPException(status_code=400, detail="Role tidak dikenal.")
    if req.password and len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password minimal 8 karakter.")

    res = update_user_by_admin(
        username=username,
        password=req.password if req.password else None,
        role=req.role,
        persona=req.assistant_persona,
        full_name=req.full_name,
    )
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res


@app.delete("/api/admin/users/{username}")
async def delete_user_endpoint(username: str, admin: dict = Depends(require_superadmin)):
    """Menghapus user tertentu."""
    if admin["username"].lower() == username.lower():
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus akun Anda sendiri.")

    res = delete_user_by_admin(username)
    if not res["success"]:
        raise HTTPException(status_code=400, detail=res["message"])
    return res


@app.get("/api/admin/sessions")
async def get_admin_all_sessions_endpoint(
    limit: int = 50,
    admin: dict = Depends(require_superadmin),
):
    """Audit log: Mengambil seluruh sesi percakapan dari semua user."""
    return get_all_sessions_for_audit(limit=limit)


@app.get("/api/admin/sessions/{session_id}/messages")
async def get_admin_session_messages_endpoint(
    session_id: str,
    admin: dict = Depends(require_superadmin),
):
    """Audit log: Mengambil riwayat pesan percakapan spesifik tanpa batasan user."""
    return get_chat_messages(session_id)


# --- CHAT ---

def _guest_client_key(request: Request) -> str:
    """Kunci kuota tamu berbasis alamat IP klien."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: Request,
    chat_req: ChatRequest,
    user: dict = Depends(get_current_user_optional),
):
    """Endpoint utama untuk memproses chat dari user."""
    is_guest = user.get("is_guest", True)

    if is_guest:
        # Kuota harian ditegakkan di server; penghitung di browser tidak dipercaya.
        quota = consume_guest_quota(
            _guest_client_key(request), date.today().isoformat(), settings.guest_daily_limit
        )
        if not quota["allowed"]:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Batas {quota['limit']} prompt gratis per hari untuk tamu sudah tercapai. "
                    "Silakan login untuk melanjutkan."
                ),
            )
        user_role, user_persona = "guest", ""
        active_session_id = None
    else:
        profile = get_user_by_username(user["username"])
        if not profile:
            raise HTTPException(status_code=401, detail="User tidak ditemukan.")
        user_role = profile["role"]
        user_persona = profile["assistant_persona"]

        active_session_id = chat_req.session_id
        # Sesi yang dikirim klien harus benar-benar milik user tersebut.
        if active_session_id and not session_belongs_to(active_session_id, profile["username"]):
            raise HTTPException(status_code=404, detail="Sesi percakapan tidak ditemukan.")

        if not active_session_id:
            new_session = create_chat_session(profile["username"], title="Percakapan Baru")
            if new_session:
                active_session_id = new_session["session_id"]

        chat_req.session_id = active_session_id
        if active_session_id:
            add_chat_message(active_session_id, "user", chat_req.message)

    # Lengkapi konteks percakapan dari database bila request tidak membawa histori.
    if active_session_id and not chat_req.history:
        raw_msgs = get_chat_messages(active_session_id, username=user["username"])
        db_history = [
            {
                "role": "assistant" if m["role"] in ("ai", "assistant") else "user",
                "content": m["content"],
            }
            # Pesan terakhir adalah prompt yang baru saja disimpan di atas.
            for m in raw_msgs[:-1]
        ]
        if db_history:
            # Ambil maksimal 12 pesan terakhir untuk efisiensi context window
            chat_req.history = db_history[-12:]
            logger.info(
                f"Dimuat {len(chat_req.history)} pesan histori dari session "
                f"{active_session_id} untuk konteks percakapan."
            )

    response = await process_chat(chat_req, user_role, user_persona, username=user["username"])

    if not is_guest and active_session_id:
        sources_str = json.dumps([s.model_dump() for s in response.sources]) if response.sources else ""
        add_chat_message(active_session_id, "ai", response.reply, sources_str)

    response.session_id = active_session_id
    return response


@app.get("/api/artifacts/{artifact_id}")
async def download_artifact(artifact_id: str, user: dict = Depends(get_current_user_optional)):
    """Unduh berkas (Excel/CSV) yang dihasilkan asisten.

    Berkas dapat memuat data SAP, sehingga hanya dapat diambil oleh akun yang
    memintanya dan hanya selama masa berlaku singkat.
    """
    item = get_artifact(artifact_id, owner=user["username"])
    if not item:
        raise HTTPException(status_code=404, detail="Berkas tidak ditemukan atau sudah kedaluwarsa.")

    return Response(
        content=item["data"],
        media_type=item["content_type"],
        headers={"Content-Disposition": f'attachment; filename="{item["filename"]}"'},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
