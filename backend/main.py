import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Any, Dict, List, Optional, Union

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel

from agent import process_chat
from artifacts import get_artifact
from uploads import MAX_ATTACHMENTS_PER_MESSAGE, UploadRejected, store_upload
from auth import (
    create_access_token,
    get_current_user,
    get_current_user_optional,
)
from auth import require_superadmin as require_superadmin_token
from config import settings, _EPHEMERAL_JWT_SECRET
from database import (
    add_chat_message,
    attach_uploads_to_session,
    check_login_block,
    clear_login_failures,
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
    get_backend_info,
    get_chat_sessions,
    get_feedback_messages,
    get_role_limits,
    get_token_usage,
    hitung_permintaan_semenit,
    catat_permintaan,
    record_token_usage,
    reset_token_usage,
    ringkasan_pemakaian_harian,
    set_role_limit,
    tanggal_kuota,
    get_system_config,
    get_user_by_username,
    init_db,
    list_all_users,
    load_upload_file,
    load_uploads,
    purge_expired_artifacts,
    purge_expired_uploads,
    register_login_failure,
    rename_chat_session,
    search_chat_history,
    session_belongs_to,
    truncate_chat_messages_from,
    update_message_feedback,
    update_system_config,
    update_user_by_admin,
    update_user_full_name,
    update_user_persona,
    get_skills,
    get_skill_by_id,
    create_skill,
    update_skill,
    delete_skill,
    get_chat_modes,
    get_chat_mode_by_id,
    get_chat_mode_by_code,
    create_chat_mode,
    update_chat_mode,
    delete_chat_mode,
    set_default_chat_mode,
    get_role_modes,
    set_role_mode,
    get_modes_for_role,
)
from mcp_manager import mcp_manager
from models import ChatRequest, ChatResponse, UsageStats

logger = logging.getLogger(__name__)


async def _artifact_cleanup_loop():
    """Bersihkan berkas kedaluwarsa secara berkala selama server hidup."""
    while True:
        try:
            await asyncio.sleep(3600)
            removed = purge_expired_artifacts() + purge_expired_uploads()
            if removed:
                logger.info(f"{removed} berkas kedaluwarsa dibersihkan.")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Pembersihan berkas gagal: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inisialisasi database schema & user bootstrap saat server dinyalakan."""
    if _EPHEMERAL_JWT_SECRET:
        logger.warning(
            "JWT_SECRET tidak diset — memakai secret acak sementara. Semua sesi login "
            "akan gugur setiap restart dan tidak konsisten antar worker. "
            "Set JWT_SECRET di .env untuk produksi."
        )
    # Kegagalan database selalu fatal: tanpa PostgreSQL aplikasi tidak punya
    # tempat menyimpan user, percakapan, maupun berkas hasil generate.
    init_db()
    # Bersihkan berkas kedaluwarsa saat startup; TTL-nya pendek sehingga tidak
    # perlu penjadwal tersendiri.
    removed = purge_expired_artifacts() + purge_expired_uploads()
    if removed:
        logger.info(f"{removed} berkas kedaluwarsa dibersihkan saat startup.")

    # Server produksi bisa berjalan berminggu-minggu tanpa restart, sehingga
    # pembersihan saat startup saja tidak cukup.
    cleanup = asyncio.create_task(_artifact_cleanup_loop())
    try:
        yield
    finally:
        cleanup.cancel()


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


def _client_ip(request: Request) -> str:
    """Alamat IP klien, menghormati X-Forwarded-For dari reverse proxy."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


@app.get("/")
async def root():
    """Redirect ke halaman dokumentasi API (Swagger UI)."""
    return RedirectResponse(url="/docs")


@app.get("/healthz")
async def healthz():
    """Health check untuk load balancer / monitoring.

    Menyertakan database yang sedang dipakai; bila koneksi bermasalah endpoint
    ini melaporkan "degraded" alih-alih gagal senyap.
    """
    try:
        info = get_backend_info()
    except Exception as e:
        return {"status": "degraded", "database": "unavailable", "detail": str(e)[:200]}

    return {"status": "ok", "database": info["engine"]}


# --- AUTENTIKASI ---

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/login")
async def login(req: LoginRequest, request: Request):
    """Endpoint autentikasi user. Mengembalikan access token JWT.

    Percobaan gagal dibatasi per (IP, username) agar tebak-password tidak dapat
    dijalankan tanpa batas; bcrypt memperlambat, tetapi tidak menghentikannya.
    """
    attempt_key = f"{_client_ip(request)}|{(req.username or '').strip().lower()}"[:120]

    blocked_for = check_login_block(attempt_key)
    if blocked_for > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Terlalu banyak percobaan login yang gagal. Coba lagi dalam {blocked_for // 60 + 1} menit.",
        )

    user = authenticate_user(req.username, req.password)
    if not user:
        register_login_failure(
            attempt_key, settings.login_max_failures, settings.login_lock_seconds
        )
        raise HTTPException(status_code=401, detail="Username atau password salah")

    clear_login_failures(attempt_key)
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
    mcp_sql_config_json: str = None
    mcp_email_config_json: str = None
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
    ai_suggestions_enabled: bool = None


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
        sql_json = sys_cfg.get("mcp_sql_config_json", sys_cfg.get("mcp_email_config_json", ""))
        payload.update({
            "mcp_sap_config_json": sys_cfg.get("mcp_sap_config_json", ""),
            "mcp_rag_config_json": sys_cfg.get("mcp_rag_config_json", ""),
            "mcp_sql_config_json": sql_json,
            "mcp_email_config_json": sql_json,
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
            "ai_suggestions_enabled": sys_cfg.get("ai_suggestions_enabled", True),
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
            mcp_sql_json=config.mcp_sql_config_json or config.mcp_email_config_json,
            mcp_email_json=config.mcp_sql_config_json or config.mcp_email_config_json,
            nine_router_enabled=config.nine_router_enabled,
            nine_router_base_url=config.nine_router_base_url,
            nine_router_model=config.nine_router_model,
            nine_router_api_key=nine_key,
            openrouter_enabled=config.openrouter_enabled,
            openrouter_model=config.openrouter_model,
            openrouter_fallback_model=config.openrouter_fallback_model,
            openrouter_api_key=open_key,
            global_assistant_persona=config.global_assistant_persona,
            ai_suggestions_enabled=config.ai_suggestions_enabled,
        )

    return {"status": "success"}


# --- CHAT SESSIONS & HISTORY ENDPOINTS ---

class CreateSessionRequest(BaseModel):
    title: str = "Percakapan Baru"


class RenameSessionRequest(BaseModel):
    title: str


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


@app.patch("/api/sessions/{session_id}")
@app.put("/api/sessions/{session_id}")
async def rename_session_endpoint(
    session_id: str,
    req: RenameSessionRequest,
    user: dict = Depends(get_current_user),
):
    title_clean = (req.title or "").strip()
    if not title_clean:
        raise HTTPException(status_code=400, detail="Judul sesi tidak boleh kosong.")
    success = rename_chat_session(session_id, user["username"], title_clean[:100])
    if not success:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan atau bukan milik Anda.")
    return {"status": "success", "session_id": session_id, "title": title_clean[:100]}


@app.delete("/api/sessions/{session_id}")
async def delete_session_endpoint(session_id: str, user: dict = Depends(get_current_user)):
    success = delete_chat_session(session_id, user["username"])
    if not success:
        raise HTTPException(status_code=404, detail="Sesi tidak ditemukan.")
    return {"status": "success"}


@app.get("/api/sessions/search")
async def search_sessions_endpoint(
    q: str = "",
    user: dict = Depends(get_current_user),
):
    """Cari kata kunci pada judul percakapan dan isi pesan milik user sendiri."""
    return search_chat_history(user["username"], q)


@app.delete("/api/messages/{message_id}")
async def truncate_from_message_endpoint(
    message_id: int,
    user: dict = Depends(get_current_user),
):
    """Hapus sebuah pesan beserta semua pesan sesudahnya.

    Dipakai sebelum "buat ulang jawaban" dan "edit pertanyaan", agar riwayat
    yang dikirim ulang ke model tidak memuat versi lama dari titik itu.
    """
    session_id = truncate_chat_messages_from(message_id, user["username"])
    if not session_id:
        raise HTTPException(status_code=404, detail="Pesan tidak ditemukan.")
    return {"session_id": session_id}


@app.get("/api/sessions/{session_id}/messages")
async def get_session_messages_endpoint(
    session_id: str,
    limit: int = 200,
    before_id: int = None,
    user: dict = Depends(get_current_user),
):
    """Riwayat pesan satu sesi, dibatasi pada sesi milik user yang meminta.

    Mengembalikan `limit` pesan terakhir; `before_id` memuat halaman sebelumnya
    agar percakapan panjang tidak dikirim sekaligus.
    """
    if not session_id or session_id == "undefined":
        return []
    return get_chat_messages(session_id, username=user["username"], limit=limit, before_id=before_id)


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


# --- PERAN ---
#
# 'user' lama berisi para pengembang ABAP, jadi seluruhnya dipindahkan ke
# 'abaper' oleh migrasi 0004. 'functional' dan 'user' adalah peran baru yang
# TIDAK berhak mengubah program.
ROLE_TERSEDIA = ("superadmin", "abaper", "functional", "user")


# --- KUOTA TOKEN ---

class BatasPeranRequest(BaseModel):
    role: str
    daily_token_limit: int = 0     # 0 = tanpa batas
    per_minute_limit: int = 0      # 0 = tanpa batas


class SaklarLimitRequest(BaseModel):
    enabled: bool


@app.get("/api/quota")
async def quota_saya_endpoint(user: dict = Depends(get_current_user)):
    """Sisa kuota pengguna yang sedang login."""
    profil = get_user_by_username(user["username"])
    if not profil:
        raise HTTPException(status_code=401, detail="User tidak ditemukan.")
    return status_kuota(profil["username"], profil["role"])


@app.get("/api/admin/quota")
async def quota_admin_endpoint(
    tanggal: str = None,
    admin: dict = Depends(require_superadmin),
):
    """Pengaturan batas, status saklar, dan pemakaian seluruh pengguna hari ini."""
    cfg = get_system_config()
    return {
        "enforced": bool(cfg.get("token_limit_enabled")),
        "usage_date": tanggal or tanggal_kuota(),
        "role_limits": get_role_limits(),
        "usage": ringkasan_pemakaian_harian(tanggal),
    }


@app.post("/api/admin/quota/enabled")
async def saklar_limit_endpoint(
    req: SaklarLimitRequest,
    admin: dict = Depends(require_superadmin),
):
    """Nyalakan atau matikan penegakan batas.

    Dimatikan bukan berarti berhenti mencatat: pemakaian tetap dihitung supaya
    admin punya angka sebelum memutuskan batas yang wajar.
    """
    update_system_config(token_limit_enabled=req.enabled)
    return {"enforced": req.enabled}


@app.put("/api/admin/quota/limits")
async def atur_batas_peran_endpoint(
    req: BatasPeranRequest,
    admin: dict = Depends(require_superadmin),
):
    """Ubah batas harian dan batas per menit untuk satu peran."""
    if req.role.strip().lower() not in ROLE_TERSEDIA:
        raise HTTPException(status_code=400, detail=f"Peran '{req.role}' tidak dikenal.")
    if req.daily_token_limit < 0 or req.per_minute_limit < 0:
        raise HTTPException(status_code=400, detail="Batas tidak boleh negatif.")
    if not set_role_limit(req.role, req.daily_token_limit, req.per_minute_limit):
        raise HTTPException(status_code=500, detail="Batas gagal disimpan.")
    return {"status": "success", "role_limits": get_role_limits()}


@app.post("/api/admin/quota/reset")
async def reset_kuota_endpoint(
    username: str = None,
    admin: dict = Depends(require_superadmin),
):
    """Nolkan pemakaian hari ini — satu pengguna, atau semuanya bila tanpa username."""
    jumlah = reset_token_usage(username)
    return {
        "status": "success",
        "direset": username or "semua pengguna",
        "baris_terhapus": jumlah,
    }


@app.get("/api/admin/feedback")
async def get_admin_feedback_endpoint(
    kind: str = "dislike",
    limit: int = 50,
    offset: int = 0,
    admin: dict = Depends(require_superadmin),
):
    """Jawaban yang dinilai pengguna, beserta pertanyaan yang memicunya.

    Angka kepuasan pada /api/admin/stats tidak dapat ditindaklanjuti tanpa daftar
    ini: perbaikan persona dan skill berangkat dari isi jawaban yang di-👎.
    """
    return get_feedback_messages(kind=kind, limit=limit, offset=offset)


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
    if req.role not in ROLE_TERSEDIA:
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
    if req.role and req.role not in ROLE_TERSEDIA:
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
    return get_chat_messages(session_id)


# --- SKILL MANAGEMENT ENDPOINTS ---

class AdminCreateSkillRequest(BaseModel):
    name: str
    description: str = ""
    content: str
    enabled: bool = True


class AdminUpdateSkillRequest(BaseModel):
    name: str = None
    description: str = None
    content: str = None
    enabled: bool = None


@app.get("/api/admin/skills")
async def get_admin_skills_endpoint(admin: dict = Depends(require_superadmin)):
    """Mengambil daftar seluruh skill modul/spesialisasi."""
    return get_skills(enabled_only=False)


@app.post("/api/admin/skills")
async def create_skill_endpoint(
    req: AdminCreateSkillRequest,
    admin: dict = Depends(require_superadmin),
):
    """Membuat skill baru (oleh Super Admin)."""
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Nama skill wajib diisi.")
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Konten panduan skill (Markdown) wajib diisi.")

    try:
        new_skill = create_skill(
            name=req.name.strip(),
            description=req.description.strip(),
            content=req.content.strip(),
            enabled=req.enabled,
        )
        return new_skill
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membuat skill: {str(e)}")


@app.put("/api/admin/skills/{skill_id}")
async def update_skill_endpoint(
    skill_id: int,
    req: AdminUpdateSkillRequest,
    admin: dict = Depends(require_superadmin),
):
    """Memperbarui skill yang ada."""
    try:
        updated = update_skill(
            skill_id=skill_id,
            name=req.name,
            description=req.description,
            content=req.content,
            enabled=req.enabled,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Skill tidak ditemukan.")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal memperbarui skill: {str(e)}")


@app.delete("/api/admin/skills/{skill_id}")
async def delete_skill_endpoint(skill_id: int, admin: dict = Depends(require_superadmin)):
    """Menghapus skill berdasarkan ID."""
    ok = delete_skill(skill_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Skill tidak ditemukan atau gagal dihapus.")
    return {"status": "success", "message": f"Skill ID {skill_id} berhasil dihapus."}



# --- CHAT MODES & ACCESS CONTROL ENDPOINTS ---

class AdminCreateModeRequest(BaseModel):
    code: str
    name: str
    description: str = ""
    icon: str = "zap"
    provider: str = "nine_router"
    model: str = "ag/gemini-3.7-flash-medium"
    fallback_provider: str = "openrouter"
    fallback_model: str = "openrouter/free"
    max_iterations: int = 15
    enabled: bool = True
    is_default: bool = False
    sort_order: int = 0


class AdminUpdateModeRequest(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    fallback_provider: Optional[str] = None
    fallback_model: Optional[str] = None
    max_iterations: Optional[int] = None
    enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None


class AdminReorderModesRequest(BaseModel):
    mode_ids: list[int]


class AdminToggleModeMasterRequest(BaseModel):
    enabled: bool


class AdminUpdateRoleModeRequest(BaseModel):
    role: str
    mode_code: str
    enabled: Optional[bool] = None
    allowed: Optional[bool] = None


@app.get("/api/modes")
async def get_user_modes_endpoint(user: Optional[dict] = Depends(get_current_user_optional)):
    """Mengambil daftar mode chat yang tersedia untuk role user saat ini."""
    user_role = "guest"
    if user and not user.get("is_guest"):
        user_role = user.get("role", "user")
    modes = get_modes_for_role(user_role)
    cfg = get_system_config()
    return {
        "chat_modes_enabled": cfg.get("chat_modes_enabled", True),
        "modes": modes,
    }


@app.get("/api/admin/modes")
async def get_admin_modes_endpoint(admin: dict = Depends(require_superadmin)):
    """Mengambil seluruh mode chat lengkap dengan konfigurasi model dan master switch."""
    modes = get_chat_modes(enabled_only=False)
    cfg = get_system_config()
    return {
        "chat_modes_enabled": cfg.get("chat_modes_enabled", True),
        "modes": modes,
    }


@app.post("/api/admin/modes")
async def create_mode_endpoint(req: AdminCreateModeRequest, admin: dict = Depends(require_superadmin)):
    """Membuat mode chat baru."""
    if not req.code or not req.code.strip():
        raise HTTPException(status_code=400, detail="Kode mode wajib diisi.")
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Nama mode wajib diisi.")
    if not req.provider or not req.provider.strip():
        raise HTTPException(status_code=400, detail="AI Provider wajib dipilih.")
    if not req.model or not req.model.strip():
        raise HTTPException(status_code=400, detail="Model wajib diisi.")

    code_clean = req.code.strip().lower()
    existing = get_chat_mode_by_code(code_clean)
    if existing:
        raise HTTPException(status_code=400, detail=f"Mode dengan kode '{code_clean}' sudah ada.")

    try:
        new_mode = create_chat_mode(
            code=code_clean,
            name=req.name.strip(),
            description=req.description.strip(),
            icon=req.icon.strip() if req.icon else "zap",
            provider=req.provider.strip(),
            model=req.model.strip(),
            fallback_provider=req.fallback_provider.strip() if req.fallback_provider else "openrouter",
            fallback_model=req.fallback_model.strip() if req.fallback_model else "openrouter/free",
            max_iterations=req.max_iterations or 15,
            enabled=req.enabled,
            is_default=req.is_default,
            sort_order=req.sort_order or 0,
        )
        return new_mode
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membuat mode chat: {str(e)}")



@app.get("/api/admin/modes/roles")
async def get_role_modes_endpoint(admin: dict = Depends(require_superadmin)):
    """Mengambil matrix hak akses mode chat per role."""
    matrix = get_role_modes()
    cfg = get_system_config()
    return {
        "chat_modes_enabled": cfg.get("chat_modes_enabled", True),
        "matrix": matrix,
    }


@app.put("/api/admin/modes/roles")
async def set_role_mode_endpoint(req: AdminUpdateRoleModeRequest, admin: dict = Depends(require_superadmin)):
    """Mengubah hak akses mode untuk suatu role."""
    cfg = get_system_config()
    if not cfg.get("chat_modes_enabled", True):
        raise HTTPException(
            status_code=400,
            detail="Fitur mode chat sedang dinonaktifkan secara global. Aktifkan master switch terlebih dahulu untuk mengubah perizinan."
        )

    mode = get_chat_mode_by_code(req.mode_code)
    if not mode:
        raise HTTPException(status_code=404, detail=f"Mode dengan kode '{req.mode_code}' tidak ditemukan.")

    target_enabled = req.enabled if req.enabled is not None else (req.allowed if req.allowed is not None else True)
    ok = set_role_mode(req.role, req.mode_code, target_enabled)
    if not ok:
        raise HTTPException(status_code=500, detail="Gagal menyimpan perizinan role mode.")
    return {"status": "success", "role": req.role, "mode_code": req.mode_code, "enabled": target_enabled, "allowed": target_enabled}


@app.post("/api/admin/modes/enabled")
async def toggle_chat_modes_master_endpoint(req: AdminToggleModeMasterRequest, admin: dict = Depends(require_superadmin)):
    """Mengaktifkan atau menonaktifkan master switch fitur mode chat."""
    ok = update_system_config(chat_modes_enabled=req.enabled)
    if not ok:
        raise HTTPException(status_code=500, detail="Gagal mengubah status master switch mode chat.")
    return {"status": "success", "chat_modes_enabled": req.enabled}


@app.put("/api/admin/modes/{mode_id}")
async def update_mode_endpoint(mode_id: int, req: AdminUpdateModeRequest, admin: dict = Depends(require_superadmin)):
    """Memperbarui mode chat."""
    existing = get_chat_mode_by_id(mode_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Mode chat tidak ditemukan.")

    if req.code is not None:
        code_clean = req.code.strip().lower()
        if not code_clean:
            raise HTTPException(status_code=400, detail="Kode mode tidak boleh kosong.")
        other = get_chat_mode_by_code(code_clean)
        if other and other["id"] != mode_id:
            raise HTTPException(status_code=400, detail=f"Mode dengan kode '{code_clean}' sudah digunakan.")
        req.code = code_clean

    try:
        updated = update_chat_mode(
            mode_id=mode_id,
            code=req.code,
            name=req.name.strip() if req.name is not None else None,
            description=req.description.strip() if req.description is not None else None,
            icon=req.icon.strip() if req.icon is not None else None,
            provider=req.provider.strip() if req.provider is not None else None,
            model=req.model.strip() if req.model is not None else None,
            fallback_provider=req.fallback_provider.strip() if req.fallback_provider is not None else None,
            fallback_model=req.fallback_model.strip() if req.fallback_model is not None else None,
            max_iterations=req.max_iterations,
            enabled=req.enabled,
            is_default=req.is_default,
            sort_order=req.sort_order,
        )
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal memperbarui mode chat: {str(e)}")


@app.delete("/api/admin/modes/{mode_id}")
async def delete_mode_endpoint(mode_id: int, admin: dict = Depends(require_superadmin)):
    """Menghapus mode chat."""
    existing = get_chat_mode_by_id(mode_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Mode chat tidak ditemukan.")

    if existing.get("is_default"):
        raise HTTPException(
            status_code=400,
            detail="Mode default tidak dapat dihapus. Tetapkan mode lain sebagai default terlebih dahulu."
        )

    all_modes = get_chat_modes()
    cfg = get_system_config()
    if cfg.get("chat_modes_enabled", True) and len(all_modes) <= 1:
        raise HTTPException(
            status_code=400,
            detail="Tidak dapat menghapus seluruh mode saat fitur mode chat aktif. Nonaktifkan master switch terlebih dahulu."
        )

    ok = delete_chat_mode(mode_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Gagal menghapus mode chat.")
    return {"status": "success", "message": f"Mode '{existing['name']}' berhasil dihapus."}


@app.post("/api/admin/modes/{mode_id}/default")
async def set_default_mode_endpoint(mode_id: int, admin: dict = Depends(require_superadmin)):
    """Menetapkan mode chat sebagai default."""
    existing = get_chat_mode_by_id(mode_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Mode chat tidak ditemukan.")
    ok = set_default_chat_mode(mode_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Gagal menetapkan mode default.")
    return {"status": "success", "message": f"Mode '{existing['name']}' berhasil dijadikan default."}


@app.post("/api/admin/modes/reorder")
async def reorder_modes_endpoint(req: AdminReorderModesRequest, admin: dict = Depends(require_superadmin)):
    """Perbarui urutan sort_order seluruh mode chat."""
    from database import reorder_chat_modes, get_chat_modes
    if not req.mode_ids:
        raise HTTPException(status_code=400, detail="Daftar ID mode tidak boleh kosong.")
    ok = reorder_chat_modes(req.mode_ids)
    if not ok:
        raise HTTPException(status_code=500, detail="Gagal menyimpan urutan mode.")
    return {"status": "success", "message": "Urutan mode berhasil diperbarui.", "modes": get_chat_modes()}


# --- CHAT ---

def _batas_peran(role: str) -> dict:
    """Batas yang berlaku untuk sebuah peran. 0 = tanpa batas."""
    batas = get_role_limits().get((role or "").lower())
    return batas or {"daily_token_limit": 0, "per_minute_limit": 0}


def status_kuota(username: str, role: str) -> dict:
    """Ringkasan kuota seorang pengguna untuk ditampilkan maupun ditegakkan."""
    cfg = get_system_config()
    aktif = bool(cfg.get("token_limit_enabled"))
    batas = _batas_peran(role)
    pakai = get_token_usage(username)

    harian = batas["daily_token_limit"]
    terpakai = pakai["total_tokens"]
    sisa = None if harian <= 0 else max(0, harian - terpakai)
    persen = None if harian <= 0 else min(100, round(terpakai * 100 / harian))

    return {
        "enforced": aktif,
        "unlimited": harian <= 0,
        "daily_token_limit": harian,
        "per_minute_limit": batas["per_minute_limit"],
        "used_tokens": terpakai,
        "remaining_tokens": sisa,
        "used_percent": persen,
        "requests_today": pakai["requests"],
        "estimated": pakai["estimated"],
        "usage_date": pakai["usage_date"],
        "role": role,
    }


def _tegakkan_kuota(username: str, role: str) -> None:
    """Tolak permintaan bila kuota habis atau terlalu cepat beruntun.

    Pemeriksaan memakai pemakaian yang SUDAH tercatat: jumlah token permintaan
    ini sendiri baru diketahui setelah model menjawab. Satu permintaan karena
    itu dapat melewati batas sedikit, dan yang berikutnya akan ditolak.
    """
    cfg = get_system_config()
    if not cfg.get("token_limit_enabled"):
        return

    batas = _batas_peran(role)

    per_menit = batas["per_minute_limit"]
    if per_menit > 0 and hitung_permintaan_semenit(username) >= per_menit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Terlalu banyak permintaan beruntun (batas {per_menit} per menit). "
                "Tunggu sebentar lalu coba lagi."
            ),
        )

    harian = batas["daily_token_limit"]
    if harian > 0:
        terpakai = get_token_usage(username)["total_tokens"]
        if terpakai >= harian:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Kuota token harian Anda sudah habis ({terpakai:,} dari {harian:,} token). "
                    "Kuota dihitung ulang setiap tengah malam. Hubungi administrator bila "
                    "Anda membutuhkan tambahan."
                ).replace(",", "."),
            )


def _guest_client_key(request: Request) -> str:
    """Kunci kuota tamu berbasis alamat IP klien."""
    return _client_ip(request)


@app.post("/api/chat/stream")
async def chat_stream_endpoint(
    request: Request,
    chat_req: ChatRequest,
    user: dict = Depends(get_current_user_optional),
):
    """Sama seperti /api/chat, tetapi melaporkan progres selama diproses.

    Dikirim sebagai Server-Sent Events sehingga pengguna melihat tahapan yang
    sedang berjalan alih-alih menunggu tanpa keterangan. Tidak ada perkiraan
    waktu: yang dilaporkan adalah langkah keberapa dari batas iterasi agen dan
    apa yang sedang dikerjakan.
    """
    queue: asyncio.Queue = asyncio.Queue()

    async def on_progress(**event):
        await queue.put({"type": "progress", **event})

    async def on_token(text: str = "", reset: bool = False):
        # `reset` dipakai ketika teks yang sudah mengalir ternyata bukan jawaban
        # akhir (mis. model justru memanggil tool), sehingga klien menghapusnya.
        if reset:
            await queue.put({"type": "token_reset"})
        elif text:
            await queue.put({"type": "token", "text": text})

    async def run():
        try:
            response = await _run_chat(
                request, chat_req, user, on_progress=on_progress, on_token=on_token
            )
            await queue.put({"type": "result", "data": response.model_dump()})
        except HTTPException as e:
            await queue.put({"type": "error", "status": e.status_code, "detail": e.detail})
        except Exception as e:
            logger.error(f"Chat streaming gagal: {e}")
            await queue.put({"type": "error", "status": 500, "detail": "Terjadi kesalahan saat memproses permintaan."})
        finally:
            await queue.put(None)

    async def event_source():
        task = asyncio.create_task(run())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            # Jika klien menutup koneksi (mis. browser di-minimize di HP / koneksi drop):
            # Jangan batalkan tugas jika pengguna terdaftar, agar proses agen AI
            # tetap selesai di latar belakang server dan jawabannya tersimpan ke database.
            # Batalkan hanya jika pengguna adalah tamu (guest) tanpa sesi tersimpan.
            if is_guest and not task.done():
                task.cancel()

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Cegah buffering di proxy yang belum dikonfigurasi.
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/chat/suggestions")
async def get_chat_suggestions_endpoint(
    lang: str = "id",
    user: dict = Depends(get_current_user_optional),
):
    """Kembalikan 3 saran pertanyaan personal berbasis role & riwayat chat user."""
    from agent import generate_chat_suggestions
    from database import get_user_by_username, get_recent_user_queries

    is_guest = user.get("is_guest", True)
    role = "guest"
    persona = ""
    recent_queries = []

    if not is_guest and user.get("username"):
        profile = get_user_by_username(user["username"])
        if profile:
            role = profile.get("role", "user")
            persona = profile.get("assistant_persona", "")
        recent_queries = get_recent_user_queries(user["username"], limit=6)

    sys_cfg = get_system_config()
    if not sys_cfg.get("ai_suggestions_enabled", True):
        from agent import DEFAULT_SUGGESTIONS
        lang_key = "en" if str(lang).lower().startswith("en") else "id"
        role_key = (role or "").lower()
        fallback = (
            DEFAULT_SUGGESTIONS.get(lang_key, {}).get(role_key)
            or DEFAULT_SUGGESTIONS.get(lang_key, {}).get("default")
            or DEFAULT_SUGGESTIONS["id"]["default"]
        )
        return {"suggestions": fallback, "dynamic": False}

    suggestions = await generate_chat_suggestions(
        role=role,
        persona=persona,
        recent_queries=recent_queries,
        lang=lang,
    )
    return {"suggestions": suggestions, "dynamic": True}


async def _run_chat(
    request: Request,
    chat_req: ChatRequest,
    user: dict,
    on_progress=None,
    on_token=None,
) -> ChatResponse:
    """Alur chat yang dipakai bersama endpoint biasa dan endpoint streaming."""
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
        user_message_id = None
    else:
        profile = get_user_by_username(user["username"])
        if not profile:
            raise HTTPException(status_code=401, detail="User tidak ditemukan.")
        user_role = profile["role"]
        user_persona = profile["assistant_persona"]

        # Kuota diperiksa sebelum pekerjaan dimulai; menolak setelah model
        # menjawab berarti biayanya sudah terlanjur keluar.
        _tegakkan_kuota(profile["username"], user_role)
        catat_permintaan(profile["username"])

        user_message_id = None
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
            # Lampiran disimpan bersama pesan pengguna agar tetap tampil setelah
            # halaman dimuat ulang, dan diikat ke sesinya.
            attachments_str = ""
            if chat_req.attachment_ids:
                ids = chat_req.attachment_ids[:MAX_ATTACHMENTS_PER_MESSAGE]
                chat_req.attachment_ids = ids
                attach_uploads_to_session(ids, profile["username"], active_session_id)
                # Simpan metadata lengkap agar antarmuka tidak perlu memanggil
                # API tambahan hanya untuk menampilkan nama berkasnya.
                attachments_str = json.dumps([
                    {
                        "upload_id": item["upload_id"],
                        "filename": item["filename"],
                        "kind": item["kind"],
                        "content_type": item["content_type"],
                    }
                    for item in load_uploads(ids, profile["username"])
                ])
            user_message_id = add_chat_message(
                active_session_id, "user", chat_req.message, attachments=attachments_str
            )

    # Sumber riwayat percakapan.
    #
    # Untuk user yang login, riwayat SELALU diambil dari database dan riwayat
    # yang dikirim klien diabaikan. Sebelumnya browser yang menentukan berapa
    # banyak riwayat ikut dikirim ke model — artinya biaya token dikendalikan
    # dari sisi klien, dan dapat dibengkakkan dengan sengaja.
    #
    # Tamu tidak punya sesi tersimpan, sehingga riwayatnya memang harus datang
    # dari klien; besarnya tetap dibatasi anggaran token di dalam agen.
    if active_session_id:
        raw_msgs = get_chat_messages(
            active_session_id,
            username=user["username"],
            limit=settings.history_max_messages,
        )
        chat_req.history = [
            {
                "role": "assistant" if m["role"] in ("ai", "assistant") else "user",
                "content": m["content"],
            }
            # Pesan terakhir adalah prompt yang baru saja disimpan di atas.
            for m in raw_msgs[:-1]
        ]
        logger.info(
            f"Riwayat sesi {active_session_id}: {len(chat_req.history)} pesan diambil dari database."
        )

    response = await process_chat(
        chat_req,
        user_role,
        user_persona,
        username=user["username"],
        on_progress=on_progress,
        on_token=on_token,
    )

    if not is_guest and active_session_id:
        sources_str = json.dumps([s.model_dump() for s in response.sources]) if response.sources else ""
        # Metadata berkas ikut disimpan; tanpa ini tombol unduh hilang setelah
        # halaman dimuat ulang meski berkasnya masih tersimpan di database.
        artifacts_str = json.dumps([a.model_dump() for a in response.artifacts]) if response.artifacts else ""
        msg_id = add_chat_message(active_session_id, "ai", response.reply, sources_str, artifacts_str)
        response.message_id = msg_id

    # Pencatatan pemakaian.
    #
    # Bila provider melaporkan jumlah token, angka itu yang dipakai. Bila tidak,
    # jumlahnya diperkirakan dari panjang teks agar kuota tetap dapat ditegakkan
    # — tanpa itu, batas apa pun tidak akan pernah tercapai pada provider yang
    # diam. Perkiraan ditandai supaya tidak disajikan seolah-olah hasil ukur.
    if not is_guest:
        pakai = response.usage
        if pakai and pakai.total_tokens:
            record_token_usage(
                user["username"], pakai.prompt_tokens or 0, pakai.completion_tokens or 0,
                estimated=False,
            )
        else:
            from conversation import estimate_tokens
            masuk = estimate_tokens(chat_req.message or "")
            for m in (chat_req.history or []):
                masuk += estimate_tokens(m.get("content") if isinstance(m, dict) else "")
            keluar = estimate_tokens(response.reply or "")
            record_token_usage(user["username"], masuk, keluar, estimated=True)
            if response.usage is None:
                response.usage = UsageStats()
            response.usage.prompt_tokens = masuk
            response.usage.completion_tokens = keluar
            response.usage.total_tokens = masuk + keluar
            response.usage.estimated = True

        response.quota = status_kuota(user["username"], user_role)

    response.session_id = active_session_id
    response.user_message_id = user_message_id
    return response


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: Request,
    chat_req: ChatRequest,
    user: dict = Depends(get_current_user_optional),
):
    """Endpoint utama untuk memproses chat dari user."""
    return await _run_chat(request, chat_req, user)


class MessageFeedbackRequest(BaseModel):
    feedback: Optional[str] = None  # 'like', 'dislike', or None


@app.post("/api/messages/{message_id}/feedback")
async def message_feedback_endpoint(
    message_id: int,
    req: MessageFeedbackRequest,
    user: dict = Depends(get_current_user_optional),
):
    """Menyimpan feedback rating ('like' / 'dislike' / null) dari pengguna untuk pesan AI."""
    if req.feedback not in (None, "", "like", "dislike"):
        raise HTTPException(status_code=400, detail="Feedback harus bernilai 'like', 'dislike', atau null.")
    fb_val = req.feedback if req.feedback in ("like", "dislike") else None
    username = None if user.get("is_guest") else user.get("username")
    ok = update_message_feedback(message_id, fb_val, username=username)
    return {"success": ok, "message_id": message_id, "feedback": fb_val}


@app.post("/api/uploads")
async def upload_attachment(
    file: UploadFile = File(...),
    session_id: str = Form(None),
    user: dict = Depends(get_current_user),
):
    """Unggah satu gambar atau dokumen sebagai konteks percakapan.

    Teks dokumen diekstraksi di sini, sekali, supaya giliran percakapan
    berikutnya tidak perlu memproses ulang berkas yang sama.
    """
    data = await file.read()
    try:
        return store_upload(
            owner=user["username"],
            filename=file.filename or "berkas",
            declared_type=file.content_type or "",
            data=data,
            session_id=session_id,
        )
    except UploadRejected as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/uploads/{upload_id}")
async def get_attachment(upload_id: str, user: dict = Depends(get_current_user)):
    """Tampilkan/unduh lampiran; hanya dapat diakses pemiliknya."""
    item = load_upload_file(upload_id, user["username"])
    if not item:
        raise HTTPException(status_code=404, detail="Lampiran tidak ditemukan atau sudah kedaluwarsa.")

    disposition = "inline" if item["kind"] == "image" else "attachment"
    return Response(
        content=item["data"],
        media_type=item["content_type"],
        headers={"Content-Disposition": f'{disposition}; filename="{item["filename"]}"'},
    )


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
