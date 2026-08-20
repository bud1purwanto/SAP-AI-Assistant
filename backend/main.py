import asyncio
import json
import logging
from contextlib import asynccontextmanager
from datetime import date

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
    session_belongs_to,
    update_system_config,
    update_user_by_admin,
    update_user_full_name,
    update_user_persona,
)
from mcp_manager import mcp_manager
from models import ChatRequest, ChatResponse

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

    async def run():
        try:
            response = await _run_chat(request, chat_req, user, on_progress=on_progress)
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
            # Klien menutup koneksi (mis. menekan "Hentikan"): batalkan pekerjaan
            # agar tidak ada permintaan model yang berjalan tanpa penerima.
            if not task.done():
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


async def _run_chat(request: Request, chat_req: ChatRequest, user: dict, on_progress=None) -> ChatResponse:
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
            add_chat_message(
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
        chat_req, user_role, user_persona, username=user["username"], on_progress=on_progress
    )

    if not is_guest and active_session_id:
        sources_str = json.dumps([s.model_dump() for s in response.sources]) if response.sources else ""
        # Metadata berkas ikut disimpan; tanpa ini tombol unduh hilang setelah
        # halaman dimuat ulang meski berkasnya masih tersimpan di database.
        artifacts_str = json.dumps([a.model_dump() for a in response.artifacts]) if response.artifacts else ""
        add_chat_message(active_session_id, "ai", response.reply, sources_str, artifacts_str)

    response.session_id = active_session_id
    return response


@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: Request,
    chat_req: ChatRequest,
    user: dict = Depends(get_current_user_optional),
):
    """Endpoint utama untuk memproses chat dari user."""
    return await _run_chat(request, chat_req, user)


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
