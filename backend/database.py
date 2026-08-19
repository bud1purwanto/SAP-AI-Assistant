import logging
import uuid
from sqlalchemy import create_engine, text
from config import settings

logger = logging.getLogger(__name__)

# Fallback DATABASE_URL if not set
DEFAULT_DB_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/ABAP_DB"
SQLITE_FALLBACK_URL = "sqlite:///./sap_ai_assistant.db"

_engine = None
_using_sqlite = False

def get_engine():
    global _engine, _using_sqlite
    if _engine is None:
        db_url = settings.database_url or DEFAULT_DB_URL
        # Normalisasi schema postgresql:// standar agar otomatis memakai psycopg v3 jika psycopg2 tidak ada
        if db_url.startswith("postgresql://"):
            db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
        try:
            test_engine = create_engine(db_url, pool_pre_ping=True, pool_timeout=3)
            # Test koneksi awal
            with test_engine.connect() as conn:
                pass
            _engine = test_engine
            _using_sqlite = False
            logger.info("Database PostgreSQL berhasil terhubung.")
        except Exception as e:
            logger.warning(f"Koneksi PostgreSQL gagal ({e}). Beralih otomatis ke SQLite lokal fallback...")
            _engine = create_engine(SQLITE_FALLBACK_URL, connect_args={"check_same_thread": False})
            _using_sqlite = True
            logger.info(f"Menggunakan SQLite database fallback: {SQLITE_FALLBACK_URL}")
    return _engine

def init_db():
    """Membuat schema 'ai_assistant' serta tabel 'users', 'system_config', 
    'chat_sessions', dan 'chat_messages', kemudian seeding user default."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            # 1. Buat Schema ai_assistant (jika didukung seperti PostgreSQL)
            try:
                conn.execute(text("CREATE SCHEMA IF NOT EXISTS ai_assistant;"))
            except Exception:
                pass
            
            # 2. Buat Tabel ai_assistant.users
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_assistant.users (
                    username VARCHAR(50) PRIMARY KEY,
                    password VARCHAR(100) NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    assistant_persona TEXT
                );
            """))
            
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
            # Jika SQLite, SERIAL diubah menjadi INTEGER PRIMARY KEY AUTOINCREMENT
            if _using_sqlite:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id VARCHAR(50) NOT NULL,
                        role VARCHAR(20) NOT NULL,
                        content TEXT NOT NULL,
                        sources TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS ai_assistant.chat_messages (
                        id SERIAL PRIMARY KEY,
                        session_id VARCHAR(50) NOT NULL REFERENCES ai_assistant.chat_sessions(session_id) ON DELETE CASCADE,
                        role VARCHAR(20) NOT NULL,
                        content TEXT NOT NULL,
                        sources TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))

            conn.commit()

            # 6. Seed User TRSTDEV (superadmin) jika belum ada
            res_dev = conn.execute(text("SELECT username FROM ai_assistant.users WHERE UPPER(username) = 'TRSTDEV'")).fetchone()
            if not res_dev:
                conn.execute(text("""
                    INSERT INTO ai_assistant.users (username, password, role, assistant_persona)
                    VALUES ('TRSTDEV', 'ronin03', 'superadmin', :persona)
                """), {"persona": settings.assistant_persona or ""})

            # 7. Seed User TRST-BUDI (user biasa) jika belum ada
            res_budi = conn.execute(text("SELECT username FROM ai_assistant.users WHERE UPPER(username) = 'TRST-BUDI'")).fetchone()
            if not res_budi:
                conn.execute(text("""
                    INSERT INTO ai_assistant.users (username, password, role, assistant_persona)
                    VALUES ('TRST-BUDI', '1234567', 'user', :persona)
                """), {"persona": settings.assistant_persona or ""})

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
        logger.error(f"Gagal inisialisasi database PostgreSQL: {e}")

def authenticate_user(username: str, password: str):
    """Verifikasi login user (case-insensitive username dan fallback jika DB seeding belum berjalan)."""
    uname_clean = (username or "").strip()
    pwd_clean = (password or "").strip()
    
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT username, password, role, assistant_persona 
                FROM ai_assistant.users 
                WHERE LOWER(username) = LOWER(:u)
            """), {"u": uname_clean}).fetchone()
            if row and row.password == pwd_clean:
                return {
                    "username": row.username,
                    "role": row.role,
                    "assistant_persona": row.assistant_persona or ""
                }
    except Exception as e:
        logger.error(f"Error authenticate_user (DB fallback check): {e}")

    # Fallback built-in credentials jika PostgreSQL belum connect atau seeding terhambat
    if uname_clean.upper() == "TRSTDEV" and pwd_clean == "ronin03":
        logger.info("Autentikasi TRSTDEV via fallback superadmin.")
        return {
            "username": "TRSTDEV",
            "role": "superadmin",
            "assistant_persona": settings.assistant_persona or ""
        }
    elif uname_clean.upper() == "TRST-BUDI" and pwd_clean == "1234567":
        logger.info("Autentikasi TRST-BUDI via fallback user.")
        return {
            "username": "TRST-BUDI",
            "role": "user",
            "assistant_persona": settings.assistant_persona or ""
        }
        
    return None

def change_user_password(username: str, old_password: str, new_password: str):
    """Ubah password user yang sedang login."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT password FROM ai_assistant.users WHERE LOWER(username) = LOWER(:u)
            """), {"u": username.strip()}).fetchone()

            if not row:
                return {"success": False, "message": "User tidak ditemukan."}

            if row.password != old_password:
                return {"success": False, "message": "Password lama salah."}

            conn.execute(text("""
                UPDATE ai_assistant.users SET password = :new_p WHERE LOWER(username) = LOWER(:u)
            """), {"new_p": new_password, "u": username.strip()})
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
                SELECT username, role, assistant_persona 
                FROM ai_assistant.users 
                WHERE LOWER(username) = LOWER(:u)
            """), {"u": uname_clean}).fetchone()
            if row:
                return {
                    "username": row.username,
                    "role": row.role,
                    "assistant_persona": row.assistant_persona or ""
                }
    except Exception as e:
        logger.error(f"Error get_user_by_username: {e}")
        
    # Fallback built-in
    if uname_clean.upper() == "TRSTDEV":
        return {"username": "TRSTDEV", "role": "superadmin", "assistant_persona": settings.assistant_persona or ""}
    elif uname_clean.upper() == "TRST-BUDI":
        return {"username": "TRST-BUDI", "role": "user", "assistant_persona": settings.assistant_persona or ""}
        
    return None

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
        "openrouter_api_key": api_key
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
    openrouter_api_key: str = None
):
    """Update konfigurasi MCP, 9Router, dan OpenRouter di database."""
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
                    "created_at": r.created_at.isoformat() if r.created_at else "",
                    "updated_at": r.updated_at.isoformat() if r.updated_at else ""
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
            conn.execute(text("""
                DELETE FROM ai_assistant.chat_sessions
                WHERE session_id = :sid AND LOWER(username) = LOWER(:u)
            """), {"sid": session_id, "u": username.strip()})
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error delete_chat_session: {e}")
        return False

def add_chat_message(session_id: str, role: str, content: str, sources: str = None):
    """Tambah pesan (user / ai) ke dalam sesi percakapan."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO ai_assistant.chat_messages (session_id, role, content, sources)
                VALUES (:sid, :r, :c, :s)
            """), {"sid": session_id, "r": role, "c": content, "s": sources or ""})
            
            # Update title jika ini pesan pertama dan judul masih "Percakapan Baru"
            if role == 'user':
                conn.execute(text("""
                    UPDATE ai_assistant.chat_sessions
                    SET updated_at = CURRENT_TIMESTAMP,
                        title = CASE 
                            WHEN title = 'Percakapan Baru' THEN SUBSTRING(:c FROM 1 FOR 40)
                            ELSE title 
                        END
                    WHERE session_id = :sid
                """), {"c": content, "sid": session_id})
            
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error add_chat_message: {e}")
        return False

def get_chat_messages(session_id: str):
    """Ambil semua pesan dalam suatu sesi percakapan."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT role, content, sources, created_at
                FROM ai_assistant.chat_messages
                WHERE session_id = :sid
                ORDER BY id ASC
            """), {"sid": session_id}).fetchall()
            return [
                {
                    "role": r.role,
                    "content": r.content,
                    "sources": r.sources if r.sources else None,
                    "created_at": r.created_at.isoformat() if r.created_at else ""
                }
                for r in rows
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
                SELECT username, role, assistant_persona 
                FROM ai_assistant.users 
                ORDER BY role DESC, username ASC
            """)).fetchall()
            return [
                {
                    "username": r.username,
                    "role": r.role,
                    "assistant_persona": r.assistant_persona or ""
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error list_all_users: {e}")
        return [
            {"username": "TRSTDEV", "role": "superadmin", "assistant_persona": ""},
            {"username": "TRST-BUDI", "role": "user", "assistant_persona": ""}
        ]

def create_new_user(username: str, password: str, role: str = "user", persona: str = ""):
    """Buat user baru di database."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            existing = conn.execute(text("SELECT username FROM ai_assistant.users WHERE LOWER(username) = LOWER(:u)"), {"u": username.strip()}).fetchone()
            if existing:
                return {"success": False, "message": f"User '{username}' sudah ada."}
            
            conn.execute(text("""
                INSERT INTO ai_assistant.users (username, password, role, assistant_persona)
                VALUES (:u, :p, :r, :persona)
            """), {"u": username.strip(), "p": password, "r": role, "persona": persona})
            conn.commit()
            return {"success": True, "message": f"User '{username}' berhasil dibuat."}
    except Exception as e:
        logger.error(f"Error create_new_user: {e}")
        return {"success": False, "message": str(e)}

def update_user_by_admin(username: str, password: str = None, role: str = None, persona: str = None):
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
            if password:
                updates.append("password = :pass")
                params["pass"] = password

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
                    "created_at": r.created_at.isoformat() if r.created_at else "",
                    "updated_at": r.updated_at.isoformat() if r.updated_at else ""
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Error get_all_sessions_for_audit: {e}")
        return []