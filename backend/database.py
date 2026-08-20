import logging
import uuid

from sqlalchemy import create_engine, text

from auth import hash_password, is_bcrypt_hash, verify_password
from config import settings

logger = logging.getLogger(__name__)

# Aplikasi ini hanya berjalan di atas PostgreSQL. Fallback SQLite sengaja
# dihapus: fallback itu membuat server tampak sehat padahal melayani database
# kosong, dan dengan lebih dari satu worker uvicorn setiap proses menulis ke
# berkas yang berbeda sehingga data terbelah.
DEFAULT_DB_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/ABAP_DB"

_engine = None


def _iso(value):
    """Normalisasi timestamp menjadi string ISO 8601."""
    if not value:
        return ""
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def get_backend_info() -> dict:
    """Laporkan database yang dipakai proses ini (untuk health check)."""
    engine = get_engine()
    return {
        "engine": "postgresql",
        "dialect": engine.dialect.name,
    }


def get_engine():
    global _engine
    if _engine is not None:
        return _engine

    db_url = settings.database_url or DEFAULT_DB_URL
    # Normalisasi schema postgresql:// standar agar otomatis memakai psycopg v3 jika psycopg2 tidak ada
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

    if not db_url.startswith("postgresql"):
        raise RuntimeError(
            f"DATABASE_URL harus menunjuk ke PostgreSQL, bukan '{db_url.split(':', 1)[0]}'. "
            "Dukungan SQLite telah dihapus."
        )

    try:
        engine = create_engine(db_url, pool_pre_ping=True, pool_timeout=5)
        with engine.connect():
            pass
    except Exception as e:
        logger.error(f"Koneksi PostgreSQL gagal: {e}")
        raise RuntimeError(
            "Tidak dapat terhubung ke PostgreSQL. Periksa DATABASE_URL dan pastikan "
            "server database berjalan."
        ) from e

    _engine = engine
    logger.info("Database PostgreSQL berhasil terhubung.")
    return _engine


def init_db():
    """Membuat schema 'ai_assistant' serta tabel 'users', 'system_config', 
    'chat_sessions', dan 'chat_messages', kemudian seeding user default."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            # 1. Buat Schema ai_assistant (jika didukung seperti PostgreSQL)
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS ai_assistant;"))
            
            # 2. Buat Tabel ai_assistant.users
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.users (
                    username VARCHAR(50) PRIMARY KEY,
                    password VARCHAR(100),
                    password_hash VARCHAR(255),
                    full_name VARCHAR(120),
                    role VARCHAR(20) NOT NULL,
                    assistant_persona TEXT
                );
            """))
            
            # 2b. Migrasi instalasi lama.
            # DDL di bawah harus idempoten, bukan dibungkus try/except: di
            # PostgreSQL satu pernyataan yang gagal membatalkan SELURUH
            # transaksi, sehingga semua perintah berikutnya ikut gagal.
            conn.execute(text(
                "ALTER TABLE ai_assistant.users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)"
            ))
            conn.execute(text(
                "ALTER TABLE ai_assistant.users ADD COLUMN IF NOT EXISTS full_name VARCHAR(120)"
            ))
            # Kolom password plaintext dipensiunkan; DROP NOT NULL bersifat
            # idempoten sehingga aman dijalankan berulang.
            conn.execute(text(
                "ALTER TABLE ai_assistant.users ALTER COLUMN password DROP NOT NULL"
            ))

            # 3. Buat Tabel ai_assistant.system_config
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.system_config (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT
                );
            """))

            # 4. Buat Tabel ai_assistant.chat_sessions
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.chat_sessions (
                    session_id VARCHAR(50) PRIMARY KEY,
                    username VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """))

            # 5. Buat Tabel ai_assistant.chat_messages
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.chat_messages (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(50) NOT NULL
                        REFERENCES ai_assistant.chat_sessions(session_id) ON DELETE CASCADE,
                    role VARCHAR(20) NOT NULL,
                    content TEXT NOT NULL,
                    sources TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """))

            # 5a. Migrasi & index untuk chat_messages / chat_sessions.
            conn.execute(text(
                "ALTER TABLE ai_assistant.chat_messages ADD COLUMN IF NOT EXISTS artifacts TEXT"
            ))
            # Lampiran dari pengguna dipisahkan dari berkas hasil generate:
            # keduanya berkas, tetapi arah dan masa berlakunya berbeda.
            conn.execute(text(
                "ALTER TABLE ai_assistant.chat_messages ADD COLUMN IF NOT EXISTS attachments TEXT"
            ))
            # Kolom-kolom ini dibaca pada setiap pembukaan sesi dan render sidebar.
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_messages_session
                ON ai_assistant.chat_messages (session_id, id);
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_sessions_username
                ON ai_assistant.chat_sessions (LOWER(username), updated_at DESC);
            """))
            # 5b. Kuota harian pengunjung tamu, ditegakkan di sisi server.
            # localStorage di browser dapat dihapus kapan saja sehingga tidak
            # bisa dijadikan dasar pembatasan.
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.guest_usage (
                    client_key VARCHAR(64) NOT NULL,
                    usage_date VARCHAR(10) NOT NULL,
                    count INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (client_key, usage_date)
                );
            """))

            conn.commit()

            # 5c. Berkas hasil generate (Excel / CSV / Word).
            # Disimpan di database, bukan di memori proses: dengan lebih dari
            # satu worker uvicorn, unduhan bisa mendarat di worker yang berbeda
            # dari yang membuat berkasnya, dan berkas hilang setiap restart.
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.generated_artifacts (
                    artifact_id VARCHAR(32) PRIMARY KEY,
                    owner VARCHAR(50) NOT NULL,
                    filename VARCHAR(255) NOT NULL,
                    content_type VARCHAR(150) NOT NULL,
                    kind VARCHAR(10) NOT NULL,
                    data BYTEA NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMPTZ NOT NULL
                );
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_artifacts_expires
                ON ai_assistant.generated_artifacts (expires_at);
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_artifacts_owner
                ON ai_assistant.generated_artifacts (LOWER(owner));
            """))

            # 5c-bis. Lampiran percakapan (gambar & dokumen) yang dikirim pengguna
            # sebagai konteks untuk AI. Teksnya diekstraksi sekali saat unggah.
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.chat_uploads (
                    upload_id VARCHAR(32) PRIMARY KEY,
                    owner VARCHAR(50) NOT NULL,
                    session_id VARCHAR(50),
                    filename VARCHAR(255) NOT NULL,
                    content_type VARCHAR(150) NOT NULL,
                    kind VARCHAR(20) NOT NULL,
                    data BYTEA NOT NULL,
                    extracted_text TEXT,
                    size_bytes INTEGER NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMPTZ NOT NULL
                );
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_uploads_owner
                ON ai_assistant.chat_uploads (LOWER(owner), created_at DESC);
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_uploads_expires
                ON ai_assistant.chat_uploads (expires_at);
            """))

            # 5d. Catatan percobaan login gagal, untuk pembatasan brute force.
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.login_attempts (
                    client_key VARCHAR(120) PRIMARY KEY,
                    failures INTEGER NOT NULL DEFAULT 0,
                    first_failure_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    locked_until TIMESTAMPTZ
                );
            """))

            # 6. Seed User TRSTDEV (superadmin) jika belum ada
            res_dev = conn.execute(text("SELECT username FROM ai_assistant.users WHERE UPPER(username) = 'TRSTDEV'")).fetchone()
            if not res_dev:
                conn.execute(text("""
                    INSERT INTO ai_assistant.users (username, password_hash, role, assistant_persona)
                    VALUES ('TRSTDEV', :pwd, 'superadmin', :persona)
                """), {"pwd": hash_password(settings.bootstrap_admin_password), "persona": settings.assistant_persona or ""})
                logger.warning(
                    "User bootstrap 'TRSTDEV' dibuat. Segera ganti passwordnya lewat menu Settings."
                )

            # 8. Seed system configs (MCP SAP, MCP RAG, AI Model configs) jika belum ada
            res_sap = conn.execute(text("SELECT key, value FROM ai_assistant.system_config WHERE key = 'mcp_sap_config_json'")).fetchone()
            if not res_sap or not res_sap.value:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('mcp_sap_config_json', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": settings.mcp_sap_config_json or DEFAULT_MCP_SAP_JSON})

            res_rag = conn.execute(text("SELECT key, value FROM ai_assistant.system_config WHERE key = 'mcp_rag_config_json'")).fetchone()
            if not res_rag or not res_rag.value:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('mcp_rag_config_json', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": settings.mcp_rag_config_json or DEFAULT_MCP_RAG_JSON})

            # 9Router Config Defaults
            res_9r_en = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'nine_router_enabled'")).fetchone()
            if not res_9r_en:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('nine_router_enabled', :val)
                """), {"val": str(settings.nine_router_enabled).lower()})

            res_9r_url = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'nine_router_base_url'")).fetchone()
            if not res_9r_url:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('nine_router_base_url', :val)
                """), {"val": settings.nine_router_base_url or "http://192.168.88.83:20128/v1"})

            res_9r_mod = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'nine_router_model'")).fetchone()
            if not res_9r_mod:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('nine_router_model', :val)
                """), {"val": settings.nine_router_model or "ag/gemini-3.7-flash-medium"})

            res_9r_key = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'nine_router_api_key'")).fetchone()
            if not res_9r_key:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('nine_router_api_key', :val)
                """), {"val": settings.nine_router_api_key or ""})

            # OpenRouter Config Defaults
            res_or_en = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'openrouter_enabled'")).fetchone()
            if not res_or_en:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('openrouter_enabled', :val)
                """), {"val": str(settings.openrouter_enabled).lower()})

            res_primary = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'openrouter_model'")).fetchone()
            if not res_primary:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('openrouter_model', :val)
                """), {"val": settings.openrouter_model or "openrouter/auto"})

            res_fallback = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'openrouter_fallback_model'")).fetchone()
            if not res_fallback:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('openrouter_fallback_model', :val)
                """), {"val": settings.openrouter_fallback_model or "openrouter/free"})

            res_apikey = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'openrouter_api_key'")).fetchone()
            if not res_apikey:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('openrouter_api_key', :val)
                """), {"val": settings.openrouter_api_key or ""})

            conn.commit()
            logger.info("Database PostgreSQL schema 'ai_assistant' berhasil diinisialisasi.")
    except Exception as e:
        logger.error(f"Gagal inisialisasi database: {e}")
        # Di produksi kegagalan ini tidak boleh ditelan: tanpa ini server tetap
        # menyala dan melayani permintaan di atas database yang belum siap.
        raise

def authenticate_user(username: str, password: str):
    """Verifikasi login user (username case-insensitive).

    Password diverifikasi terhadap hash bcrypt. Instalasi lama yang masih
    menyimpan plaintext akan otomatis di-upgrade ke hash pada login pertama
    yang berhasil. Tidak ada kredensial fallback hardcoded: bila database
    tidak dapat dihubungi, login gagal (fail closed).
    """
    uname_clean = (username or "").strip()
    pwd_clean = (password or "").strip()
    if not uname_clean or not pwd_clean:
        return None

    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT username, password, password_hash, full_name, role, assistant_persona
                FROM ai_assistant.users
                WHERE LOWER(username) = LOWER(:u)
            """), {"u": uname_clean}).fetchone()

            if not row:
                return None

            stored_hash = row.password_hash
            authenticated = False

            if is_bcrypt_hash(stored_hash):
                authenticated = verify_password(pwd_clean, stored_hash)
            elif row.password:
                # Kredensial warisan berformat plaintext.
                authenticated = row.password == pwd_clean
                if authenticated:
                    conn.execute(text("""
                        UPDATE ai_assistant.users
                        SET password_hash = :h, password = NULL
                        WHERE LOWER(username) = LOWER(:u)
                    """), {"h": hash_password(pwd_clean), "u": uname_clean})
                    conn.commit()
                    logger.info(f"Password user '{row.username}' dimigrasikan ke hash bcrypt.")

            if authenticated:
                return {
                    "username": row.username,
                    "full_name": row.full_name or "",
                    "role": row.role,
                    "assistant_persona": row.assistant_persona or ""
                }
    except Exception as e:
        logger.error(f"Error authenticate_user: {e}")

    return None


def change_user_password(username: str, old_password: str, new_password: str):
    """Ubah password user yang sedang login."""
    if not new_password or len(new_password) < 8:
        return {"success": False, "message": "Password baru minimal 8 karakter."}

    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT password, password_hash FROM ai_assistant.users
                WHERE LOWER(username) = LOWER(:u)
            """), {"u": username.strip()}).fetchone()

            if not row:
                return {"success": False, "message": "User tidak ditemukan."}

            if is_bcrypt_hash(row.password_hash):
                valid_old = verify_password(old_password, row.password_hash)
            else:
                valid_old = bool(row.password) and row.password == old_password

            if not valid_old:
                return {"success": False, "message": "Password lama salah."}

            conn.execute(text("""
                UPDATE ai_assistant.users
                SET password_hash = :new_h, password = NULL
                WHERE LOWER(username) = LOWER(:u)
            """), {"new_h": hash_password(new_password), "u": username.strip()})
            conn.commit()
            return {"success": True, "message": "Password berhasil diperbarui."}
    except Exception as e:
        logger.error(f"Error change_user_password: {e}")
        return {"success": False, "message": f"Gagal mengubah password: {str(e)}"}


def get_user_by_username(username: str):
    """Ambil detail user berdasarkan username."""
    uname_clean = (username or "").strip()
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT username, full_name, role, assistant_persona
                FROM ai_assistant.users
                WHERE LOWER(username) = LOWER(:u)
            """), {"u": uname_clean}).fetchone()
            if row:
                return {
                    "username": row.username,
                    "full_name": row.full_name or "",
                    "role": row.role,
                    "assistant_persona": row.assistant_persona or ""
                }
    except Exception as e:
        logger.error(f"Error get_user_by_username: {e}")

    return None

def update_user_full_name(username: str, full_name: str):
    """Update nama lengkap milik user tertentu."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE ai_assistant.users
                SET full_name = :fn
                WHERE LOWER(username) = LOWER(:u)
            """), {"fn": (full_name or "").strip(), "u": username.strip()})
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error update_user_full_name: {e}")
        return False


def update_user_persona(username: str, persona: str):
    """Update persona milik user tertentu."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE ai_assistant.users 
                SET assistant_persona = :p 
                WHERE LOWER(username) = LOWER(:u)
            """), {"p": persona, "u": username.strip()})
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error update_user_persona: {e}")
        return False

DEFAULT_MCP_SAP_JSON = '''{
  "mcpServers": {
    "sap-leader-remote": {
      "type": "http",
      "url": "http://192.168.1.162:8091/mcp",
      "headers": {
        "Authorization": "Bearer Trias123"
      }
    }
  }
}'''

DEFAULT_MCP_RAG_JSON = '''{
  "mcpServers": {
    "manufacturing-rag": {
      "type": "http",
      "url": "http://192.168.1.162:8090/mcp",
      "headers": {
        "Authorization": "Bearer Trias123"
      }
    }
  }
}'''

def get_system_config():
    """Ambil konfigurasi MCP SAP, MCP RAG, 9Router, dan OpenRouter dari database."""
    sap_cfg = settings.mcp_sap_config_json or DEFAULT_MCP_SAP_JSON
    rag_cfg = settings.mcp_rag_config_json or DEFAULT_MCP_RAG_JSON
    
    nine_router_enabled = settings.nine_router_enabled
    nine_router_base_url = settings.nine_router_base_url or "http://192.168.88.83:20128/v1"
    nine_router_model = settings.nine_router_model or "ag/gemini-3.7-flash-medium"
    nine_router_api_key = settings.nine_router_api_key or ""

    openrouter_enabled = settings.openrouter_enabled
    model_primary = settings.openrouter_model or "openrouter/auto"
    model_fallback = settings.openrouter_fallback_model or "openrouter/free"
    api_key = settings.openrouter_api_key or ""
    # Persona global: berlaku untuk semua user sebagai dasar, di atasnya
    # persona masing-masing user diterapkan sebagai penyesuaian.
    global_persona = settings.assistant_persona or ""

    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT key, value FROM ai_assistant.system_config")).fetchall()
            for r in rows:
                if r.key == 'mcp_sap_config_json' and r.value is not None:
                    sap_cfg = r.value
                elif r.key == 'mcp_rag_config_json' and r.value is not None:
                    rag_cfg = r.value
                elif r.key == 'nine_router_enabled' and r.value is not None:
                    nine_router_enabled = r.value.lower() in ('true', '1', 'yes')
                elif r.key == 'nine_router_base_url' and r.value is not None:
                    nine_router_base_url = r.value
                elif r.key == 'nine_router_model' and r.value is not None:
                    nine_router_model = r.value
                elif r.key == 'nine_router_api_key' and r.value is not None:
                    nine_router_api_key = r.value
                elif r.key == 'openrouter_enabled' and r.value is not None:
                    openrouter_enabled = r.value.lower() in ('true', '1', 'yes')
                elif r.key == 'openrouter_model' and r.value is not None:
                    model_primary = r.value
                elif r.key == 'openrouter_fallback_model' and r.value is not None:
                    model_fallback = r.value
                elif r.key == 'openrouter_api_key' and r.value is not None:
                    api_key = r.value
                elif r.key == 'global_assistant_persona' and r.value is not None:
                    global_persona = r.value
    except Exception as e:
        logger.error(f"Error get_system_config: {e}")
    return {
        "mcp_sap_config_json": sap_cfg,
        "mcp_rag_config_json": rag_cfg,
        "nine_router_enabled": nine_router_enabled,
        "nine_router_base_url": nine_router_base_url,
        "nine_router_model": nine_router_model,
        "nine_router_api_key": nine_router_api_key,
        "openrouter_enabled": openrouter_enabled,
        "openrouter_model": model_primary,
        "openrouter_fallback_model": model_fallback,
        "openrouter_api_key": api_key,
        "global_assistant_persona": global_persona
    }

def update_system_config(
    mcp_sap_json: str = None, 
    mcp_rag_json: str = None,
    nine_router_enabled: bool = None,
    nine_router_base_url: str = None,
    nine_router_model: str = None,
    nine_router_api_key: str = None,
    openrouter_enabled: bool = None,
    openrouter_model: str = None,
    openrouter_fallback_model: str = None,
    openrouter_api_key: str = None,
    global_assistant_persona: str = None
):
    """Update konfigurasi MCP, 9Router, OpenRouter, dan persona global di database."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            if mcp_sap_json is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('mcp_sap_config_json', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": mcp_sap_json})
                
            if mcp_rag_json is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('mcp_rag_config_json', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": mcp_rag_json})

            if nine_router_enabled is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('nine_router_enabled', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": "true" if nine_router_enabled else "false"})

            if nine_router_base_url is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('nine_router_base_url', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": nine_router_base_url})

            if nine_router_model is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('nine_router_model', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": nine_router_model})

            if nine_router_api_key is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('nine_router_api_key', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": nine_router_api_key})

            if openrouter_enabled is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('openrouter_enabled', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": "true" if openrouter_enabled else "false"})

            if openrouter_model is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('openrouter_model', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": openrouter_model})

            if openrouter_fallback_model is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('openrouter_fallback_model', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": openrouter_fallback_model})

            if openrouter_api_key is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value) 
                    VALUES ('openrouter_api_key', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": openrouter_api_key})
                
            if global_assistant_persona is not None:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('global_assistant_persona', :val)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"val": global_assistant_persona})

            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error update_system_config: {e}")
        return False

# --- CHAT SESSION & HISTORY FUNCTIONS ---

def create_chat_session(username: str, title: str = "Percakapan Baru"):
    """Buat sesi chat baru di database PostgreSQL."""
    session_id = f"session_{uuid.uuid4().hex[:12]}"
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO ai_assistant.chat_sessions (session_id, username, title)
                VALUES (:sid, :u, :t)
            """), {"sid": session_id, "u": username, "t": title})
            conn.commit()
            return {
                "session_id": session_id,
                "username": username,
                "title": title
            }
    except Exception as e:
        logger.error(f"Error create_chat_session: {e}")
        return None

def get_chat_sessions(username: str):
    """Ambil semua daftar sesi percakapan milik user."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT session_id, title, created_at, updated_at
                FROM ai_assistant.chat_sessions
                WHERE LOWER(username) = LOWER(:u)
                ORDER BY updated_at DESC
            """), {"u": username.strip()}).fetchall()
            return [
                {
                    "session_id": r.session_id,
                    "title": r.title,
                    "created_at": _iso(r.created_at),
                    "updated_at": _iso(r.updated_at)
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error get_chat_sessions: {e}")
        return []

def delete_chat_session(session_id: str, username: str):
    """Hapus sesi chat beserta pesannya."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            # Pesan dihapus eksplisit agar tidak bergantung pada ON DELETE CASCADE.
            conn.execute(text("""
                DELETE FROM ai_assistant.chat_messages
                WHERE session_id IN (
                    SELECT session_id FROM ai_assistant.chat_sessions
                    WHERE session_id = :sid AND LOWER(username) = LOWER(:u)
                )
            """), {"sid": session_id, "u": username.strip()})
            res = conn.execute(text("""
                DELETE FROM ai_assistant.chat_sessions
                WHERE session_id = :sid AND LOWER(username) = LOWER(:u)
            """), {"sid": session_id, "u": username.strip()})
            conn.commit()
            # rowcount 0 berarti sesi tidak ada atau bukan milik user ini.
            return res.rowcount > 0
    except Exception as e:
        logger.error(f"Error delete_chat_session: {e}")
        return False

def add_chat_message(session_id: str, role: str, content: str, sources: str = None,
                     artifacts: str = None, attachments: str = None):
    """Tambah pesan (user / ai) ke dalam sesi percakapan."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO ai_assistant.chat_messages
                    (session_id, role, content, sources, artifacts, attachments)
                VALUES (:sid, :r, :c, :s, :a, :att)
            """), {"sid": session_id, "r": role, "c": content, "s": sources or "",
                   "a": artifacts or "", "att": attachments or ""})
            
            # Update title jika ini pesan pertama dan judul masih "Percakapan Baru".
            if role == 'user':
                conn.execute(text("""
                    UPDATE ai_assistant.chat_sessions
                    SET updated_at = CURRENT_TIMESTAMP,
                        title = CASE
                            WHEN title = 'Percakapan Baru' THEN :title
                            ELSE title
                        END
                    WHERE session_id = :sid
                """), {"title": (content or "").strip()[:40] or "Percakapan Baru", "sid": session_id})
            
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error add_chat_message: {e}")
        return False

def session_belongs_to(session_id: str, username: str) -> bool:
    """Cek apakah sesi percakapan dimiliki user tersebut."""
    if not session_id or not username:
        return False
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT 1 FROM ai_assistant.chat_sessions
                WHERE session_id = :sid AND LOWER(username) = LOWER(:u)
            """), {"sid": session_id, "u": username.strip()}).fetchone()
            return row is not None
    except Exception as e:
        logger.error(f"Error session_belongs_to: {e}")
        return False


def get_chat_messages(session_id: str, username: str = None, limit: int = 200, before_id: int = None):
    """Ambil pesan dalam suatu sesi percakapan.

    Bila `username` diberikan, hasil dibatasi pada sesi milik user tersebut.
    Pemanggil yang melewatkan None (jalur audit Super Admin) harus sudah
    melakukan pemeriksaan otorisasinya sendiri.

    Hasil dibatasi `limit` pesan TERAKHIR agar percakapan panjang tidak
    mengirim seluruh isinya sekaligus; `before_id` dipakai untuk memuat
    halaman sebelumnya.
    """
    try:
        engine = get_engine()
        with engine.connect() as conn:
            # Ambil N pesan terakhir (opsional sebelum id tertentu), lalu balik
            # urutannya agar tetap kronologis bagi pemanggil.
            page_filter = "AND m.id < :before" if before_id else ""
            params = {"sid": session_id, "lim": max(1, min(limit, 1000))}
            if before_id:
                params["before"] = before_id

            if username is not None:
                params["u"] = username.strip()
                sql = f"""
                    SELECT m.id, m.role, m.content, m.sources, m.artifacts, m.attachments, m.created_at
                    FROM ai_assistant.chat_messages m
                    JOIN ai_assistant.chat_sessions s ON s.session_id = m.session_id
                    WHERE m.session_id = :sid AND LOWER(s.username) = LOWER(:u) {page_filter}
                    ORDER BY m.id DESC
                    LIMIT :lim
                """
            else:
                sql = f"""
                    SELECT m.id, m.role, m.content, m.sources, m.artifacts, m.attachments, m.created_at
                    FROM ai_assistant.chat_messages m
                    WHERE m.session_id = :sid {page_filter}
                    ORDER BY m.id DESC
                    LIMIT :lim
                """

            rows = conn.execute(text(sql), params).fetchall()
            return [
                {
                    "id": r.id,
                    "role": r.role,
                    "content": r.content,
                    "sources": r.sources if r.sources else None,
                    "artifacts": r.artifacts if r.artifacts else None,
                    "attachments": r.attachments if r.attachments else None,
                    "created_at": _iso(r.created_at),
                }
                for r in reversed(rows)
            ]
    except Exception as e:
        logger.error(f"Error get_chat_messages: {e}")
        return []


# --- SUPER ADMIN FUNCTIONS ---

def list_all_users():
    """Ambil seluruh daftar user untuk dashboard admin."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT username, full_name, role, assistant_persona
                FROM ai_assistant.users
                ORDER BY role DESC, username ASC
            """)).fetchall()
            return [
                {
                    "username": r.username,
                    "full_name": r.full_name or "",
                    "role": r.role,
                    "assistant_persona": r.assistant_persona or ""
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error list_all_users: {e}")
        return []

def create_new_user(username: str, password: str, role: str = "user", persona: str = "", full_name: str = ""):
    """Buat user baru di database."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            existing = conn.execute(text("SELECT username FROM ai_assistant.users WHERE LOWER(username) = LOWER(:u)"), {"u": username.strip()}).fetchone()
            if existing:
                return {"success": False, "message": f"User '{username}' sudah ada."}
            
            conn.execute(text("""
                INSERT INTO ai_assistant.users (username, password_hash, full_name, role, assistant_persona)
                VALUES (:u, :p, :fn, :r, :persona)
            """), {"u": username.strip(), "p": hash_password(password), "fn": (full_name or "").strip(),
                   "r": role, "persona": persona})
            conn.commit()
            return {"success": True, "message": f"User '{username}' berhasil dibuat."}
    except Exception as e:
        logger.error(f"Error create_new_user: {e}")
        return {"success": False, "message": str(e)}

def update_user_by_admin(username: str, password: str = None, role: str = None, persona: str = None,
                         full_name: str = None):
    """Admin mengupdate data user (role, persona, dan optional reset password)."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            existing = conn.execute(text("SELECT username, role, assistant_persona FROM ai_assistant.users WHERE LOWER(username) = LOWER(:u)"), {"u": username.strip()}).fetchone()
            if not existing:
                return {"success": False, "message": "User tidak ditemukan."}

            updates = []
            params = {"u": username.strip()}

            if role is not None:
                updates.append("role = :r")
                params["r"] = role
            if persona is not None:
                updates.append("assistant_persona = :p")
                params["p"] = persona
            if full_name is not None:
                updates.append("full_name = :fn")
                params["fn"] = full_name.strip()
            if password:
                updates.append("password_hash = :pass")
                updates.append("password = NULL")
                params["pass"] = hash_password(password)

            if updates:
                sql = f"UPDATE ai_assistant.users SET {', '.join(updates)} WHERE LOWER(username) = LOWER(:u)"
                conn.execute(text(sql), params)
                conn.commit()
            return {"success": True, "message": f"User '{username}' berhasil diperbarui."}
    except Exception as e:
        logger.error(f"Error update_user_by_admin: {e}")
        return {"success": False, "message": str(e)}

def delete_user_by_admin(username: str):
    """Hapus user beserta sesi chat-nya (kecuali akun superadmin itu sendiri)."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            # Hapus sessions user terlebih dahulu jika FK belum ON DELETE CASCADE
            conn.execute(text("DELETE FROM ai_assistant.chat_sessions WHERE LOWER(username) = LOWER(:u)"), {"u": username.strip()})
            res = conn.execute(text("DELETE FROM ai_assistant.users WHERE LOWER(username) = LOWER(:u)"), {"u": username.strip()})
            conn.commit()
            if res.rowcount == 0:
                return {"success": False, "message": "User tidak ditemukan."}
            return {"success": True, "message": f"User '{username}' berhasil dihapus."}
    except Exception as e:
        logger.error(f"Error delete_user_by_admin: {e}")
        return {"success": False, "message": str(e)}

def get_admin_system_stats():
    """Mengambil ringkasan statistik sistem untuk dashboard."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            user_count = conn.execute(text("SELECT COUNT(*) FROM ai_assistant.users")).scalar() or 0
            session_count = conn.execute(text("SELECT COUNT(*) FROM ai_assistant.chat_sessions")).scalar() or 0
            msg_count = conn.execute(text("SELECT COUNT(*) FROM ai_assistant.chat_messages")).scalar() or 0
            
            # 5 user teraktif
            top_users = conn.execute(text("""
                SELECT username, COUNT(session_id) as session_count
                FROM ai_assistant.chat_sessions
                GROUP BY username
                ORDER BY session_count DESC
                LIMIT 5
            """)).fetchall()

            return {
                "total_users": user_count,
                "total_sessions": session_count,
                "total_messages": msg_count,
                "top_users": [{"username": r.username, "sessions": r.session_count} for r in top_users]
            }
    except Exception as e:
        logger.error(f"Error get_admin_system_stats: {e}")
        return {
            "total_users": 0,
            "total_sessions": 0,
            "total_messages": 0,
            "top_users": []
        }

def get_all_sessions_for_audit(limit: int = 50):
    """Ambil semua riwayat sesi chat dari seluruh user untuk audit log."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT s.session_id, s.username, s.title, s.created_at, s.updated_at,
                       COUNT(m.id) as message_count
                FROM ai_assistant.chat_sessions s
                LEFT JOIN ai_assistant.chat_messages m ON s.session_id = m.session_id
                GROUP BY s.session_id, s.username, s.title, s.created_at, s.updated_at
                ORDER BY s.updated_at DESC
                LIMIT :lim
            """), {"lim": limit}).fetchall()
            return [
                {
                    "session_id": r.session_id,
                    "username": r.username,
                    "title": r.title,
                    "message_count": r.message_count,
                    "created_at": _iso(r.created_at),
                    "updated_at": _iso(r.updated_at)
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error get_all_sessions_for_audit: {e}")
        return []

# --- KUOTA TAMU (SISI SERVER) ---

def consume_guest_quota(client_key: str, usage_date: str, limit: int) -> dict:
    """Catat satu pemakaian prompt tamu dan laporkan apakah kuota masih tersedia.

    Dihitung di server karena penghitung di localStorage dapat direset user
    kapan saja hanya dengan menghapus site data.
    """
    if limit <= 0:
        return {"allowed": False, "used": 0, "limit": limit}
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT count FROM ai_assistant.guest_usage
                WHERE client_key = :k AND usage_date = :d
            """), {"k": client_key, "d": usage_date}).fetchone()

            used = row.count if row else 0
            if used >= limit:
                return {"allowed": False, "used": used, "limit": limit}

            if row:
                conn.execute(text("""
                    UPDATE ai_assistant.guest_usage SET count = count + 1
                    WHERE client_key = :k AND usage_date = :d
                """), {"k": client_key, "d": usage_date})
            else:
                conn.execute(text("""
                    INSERT INTO ai_assistant.guest_usage (client_key, usage_date, count)
                    VALUES (:k, :d, 1)
                """), {"k": client_key, "d": usage_date})
            conn.commit()
            return {"allowed": True, "used": used + 1, "limit": limit}
    except Exception as e:
        logger.error(f"Error consume_guest_quota: {e}")
        # Gagal-tertutup: bila kuota tidak dapat dicatat, jangan berikan akses gratis.
        return {"allowed": False, "used": 0, "limit": limit}


# --- BERKAS HASIL GENERATE ---

def save_artifact(artifact_id: str, owner: str, filename: str, content_type: str,
                  kind: str, data: bytes, expires_at) -> bool:
    """Simpan berkas hasil generate agar dapat diunduh oleh pemiliknya."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO ai_assistant.generated_artifacts
                    (artifact_id, owner, filename, content_type, kind, data, size_bytes, expires_at)
                VALUES (:id, :owner, :fn, :ct, :kind, :data, :size, :exp)
            """), {
                "id": artifact_id, "owner": owner, "fn": filename, "ct": content_type,
                "kind": kind, "data": data, "size": len(data), "exp": expires_at,
            })
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error save_artifact: {e}")
        return False


def load_artifact(artifact_id: str, owner: str):
    """Ambil berkas milik user tertentu, selama belum kedaluwarsa.

    Berkas dapat memuat data SAP, sehingga kepemilikan diperiksa di query.
    """
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT filename, content_type, data
                FROM ai_assistant.generated_artifacts
                WHERE artifact_id = :id
                  AND LOWER(owner) = LOWER(:owner)
                  AND expires_at > CURRENT_TIMESTAMP
            """), {"id": artifact_id, "owner": (owner or "").strip()}).fetchone()
            if not row:
                return None
            return {
                "filename": row.filename,
                "content_type": row.content_type,
                "data": bytes(row.data),
            }
    except Exception as e:
        logger.error(f"Error load_artifact: {e}")
        return None


def purge_expired_artifacts() -> int:
    """Hapus berkas yang sudah lewat masa berlakunya."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            res = conn.execute(text("""
                DELETE FROM ai_assistant.generated_artifacts
                WHERE expires_at <= CURRENT_TIMESTAMP
            """))
            conn.commit()
            return res.rowcount or 0
    except Exception as e:
        logger.error(f"Error purge_expired_artifacts: {e}")
        return 0


# --- PEMBATASAN PERCOBAAN LOGIN ---

def check_login_block(client_key: str):
    """Kembalikan sisa detik penguncian, atau 0 bila tidak terkunci."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT EXTRACT(EPOCH FROM (locked_until - CURRENT_TIMESTAMP)) AS sisa
                FROM ai_assistant.login_attempts
                WHERE client_key = :k AND locked_until IS NOT NULL
                  AND locked_until > CURRENT_TIMESTAMP
            """), {"k": client_key}).fetchone()
            return int(row.sisa) if row and row.sisa else 0
    except Exception as e:
        logger.error(f"Error check_login_block: {e}")
        return 0


def register_login_failure(client_key: str, max_failures: int, lock_seconds: int) -> int:
    """Catat satu kegagalan login; kunci sementara bila melewati ambang.

    Mengembalikan jumlah kegagalan berturut-turut setelah pencatatan.
    """
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                INSERT INTO ai_assistant.login_attempts (client_key, failures)
                VALUES (:k, 1)
                ON CONFLICT (client_key) DO UPDATE
                SET failures = ai_assistant.login_attempts.failures + 1
                RETURNING failures
            """), {"k": client_key}).fetchone()
            failures = row.failures if row else 1

            if failures >= max_failures:
                conn.execute(text("""
                    UPDATE ai_assistant.login_attempts
                    SET locked_until = CURRENT_TIMESTAMP + make_interval(secs => :sec),
                        failures = 0
                    WHERE client_key = :k
                """), {"k": client_key, "sec": lock_seconds})
            conn.commit()
            return failures
    except Exception as e:
        logger.error(f"Error register_login_failure: {e}")
        return 0


def clear_login_failures(client_key: str):
    """Bersihkan catatan kegagalan setelah login berhasil."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("DELETE FROM ai_assistant.login_attempts WHERE client_key = :k"),
                         {"k": client_key})
            conn.commit()
    except Exception as e:
        logger.error(f"Error clear_login_failures: {e}")


def count_user_artifacts(owner: str) -> int:
    """Jumlah berkas aktif milik seorang user (untuk kuota penyimpanan)."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT COUNT(*) AS n FROM ai_assistant.generated_artifacts
                WHERE LOWER(owner) = LOWER(:o) AND expires_at > CURRENT_TIMESTAMP
            """), {"o": (owner or "").strip()}).fetchone()
            return int(row.n) if row else 0
    except Exception as e:
        logger.error(f"Error count_user_artifacts: {e}")
        return 0


def drop_oldest_artifacts(owner: str, keep: int) -> int:
    """Sisakan `keep` berkas terbaru milik user; sisanya dihapus."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            res = conn.execute(text("""
                DELETE FROM ai_assistant.generated_artifacts
                WHERE artifact_id IN (
                    SELECT artifact_id FROM ai_assistant.generated_artifacts
                    WHERE LOWER(owner) = LOWER(:o)
                    ORDER BY created_at DESC
                    OFFSET :keep
                )
            """), {"o": (owner or "").strip(), "keep": keep})
            conn.commit()
            return res.rowcount or 0
    except Exception as e:
        logger.error(f"Error drop_oldest_artifacts: {e}")
        return 0


# --- LAMPIRAN PERCAKAPAN ---

def save_upload(upload_id: str, owner: str, session_id: str, filename: str,
                content_type: str, kind: str, data: bytes, extracted_text: str,
                expires_at) -> bool:
    """Simpan satu lampiran beserta teks hasil ekstraksinya."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO ai_assistant.chat_uploads
                    (upload_id, owner, session_id, filename, content_type, kind,
                     data, extracted_text, size_bytes, expires_at)
                VALUES (:id, :owner, :sid, :fn, :ct, :kind, :data, :txt, :size, :exp)
            """), {
                "id": upload_id, "owner": owner, "sid": session_id, "fn": filename,
                "ct": content_type, "kind": kind, "data": data,
                "txt": extracted_text or "", "size": len(data), "exp": expires_at,
            })
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error save_upload: {e}")
        return False


def load_uploads(upload_ids: list, owner: str) -> list:
    """Ambil lampiran milik user tertentu, berikut isinya.

    Lampiran dapat memuat dokumen internal, sehingga kepemilikan diperiksa di
    dalam query dan id milik orang lain hanya menghasilkan daftar kosong.
    """
    if not upload_ids:
        return []
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT upload_id, filename, content_type, kind, data, extracted_text
                FROM ai_assistant.chat_uploads
                WHERE upload_id = ANY(:ids)
                  AND LOWER(owner) = LOWER(:owner)
                  AND expires_at > CURRENT_TIMESTAMP
            """), {"ids": list(upload_ids), "owner": (owner or "").strip()}).fetchall()

            found = {
                r.upload_id: {
                    "upload_id": r.upload_id,
                    "filename": r.filename,
                    "content_type": r.content_type,
                    "kind": r.kind,
                    "data": bytes(r.data),
                    "extracted_text": r.extracted_text or "",
                }
                for r in rows
            }
            # Pertahankan urutan sesuai permintaan pemanggil.
            return [found[uid] for uid in upload_ids if uid in found]
    except Exception as e:
        logger.error(f"Error load_uploads: {e}")
        return []


def load_upload_file(upload_id: str, owner: str):
    """Ambil satu lampiran untuk ditampilkan/diunduh pemiliknya."""
    rows = load_uploads([upload_id], owner)
    return rows[0] if rows else None


def attach_uploads_to_session(upload_ids: list, owner: str, session_id: str):
    """Tandai lampiran sebagai milik sesi tertentu setelah pesan terkirim."""
    if not upload_ids or not session_id:
        return
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE ai_assistant.chat_uploads
                SET session_id = :sid
                WHERE upload_id = ANY(:ids) AND LOWER(owner) = LOWER(:owner)
            """), {"ids": list(upload_ids), "sid": session_id, "owner": (owner or "").strip()})
            conn.commit()
    except Exception as e:
        logger.error(f"Error attach_uploads_to_session: {e}")


def purge_expired_uploads() -> int:
    """Hapus lampiran yang sudah lewat masa berlakunya."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            res = conn.execute(text("""
                DELETE FROM ai_assistant.chat_uploads
                WHERE expires_at <= CURRENT_TIMESTAMP
            """))
            conn.commit()
            return res.rowcount or 0
    except Exception as e:
        logger.error(f"Error purge_expired_uploads: {e}")
        return 0
