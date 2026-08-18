import logging
import uuid
from sqlalchemy import create_engine, text
from config import settings

logger = logging.getLogger(__name__)

# Fallback DATABASE_URL if not set
DEFAULT_DB_URL = "postgresql+psycopg://postgres:postgres@192.168.1.232:5432/ABAP_DB"

def get_engine():
    db_url = settings.database_url or DEFAULT_DB_URL
    return create_engine(db_url, pool_pre_ping=True)

def init_db():
    """Membuat schema 'ai_assistant' serta tabel 'users', 'system_config', 
    'chat_sessions', dan 'chat_messages', kemudian seeding user default."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            # 1. Buat Schema ai_assistant
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS ai_assistant;"))
            
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
            res_dev = conn.execute(text("SELECT username FROM ai_assistant.users WHERE username = 'TRSTDEV'")).fetchone()
            if not res_dev:
                conn.execute(text("""
                    INSERT INTO ai_assistant.users (username, password, role, assistant_persona)
                    VALUES ('TRSTDEV', 'ronin03', 'superadmin', :persona)
                """), {"persona": settings.assistant_persona or ""})

            # 7. Seed User TRST-BUDI (user biasa) jika belum ada
            res_budi = conn.execute(text("SELECT username FROM ai_assistant.users WHERE username = 'TRST-BUDI'")).fetchone()
            if not res_budi:
                conn.execute(text("""
                    INSERT INTO ai_assistant.users (username, password, role, assistant_persona)
                    VALUES ('TRST-BUDI', '1234567', 'user', :persona)
                """), {"persona": settings.assistant_persona or ""})

            # 8. Seed system configs (MCP SAP & MCP RAG) jika belum ada
            res_sap = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'mcp_sap_config_json'")).fetchone()
            if not res_sap:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('mcp_sap_config_json', :val)
                """), {"val": settings.mcp_sap_config_json or ""})

            res_rag = conn.execute(text("SELECT key FROM ai_assistant.system_config WHERE key = 'mcp_rag_config_json'")).fetchone()
            if not res_rag:
                conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES ('mcp_rag_config_json', :val)
                """), {"val": settings.mcp_rag_config_json or ""})

            conn.commit()
            logger.info("Database PostgreSQL schema 'ai_assistant' berhasil diinisialisasi.")
    except Exception as e:
        logger.error(f"Gagal inisialisasi database PostgreSQL: {e}")

def authenticate_user(username: str, password: str):
    """Verifikasi login user."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT username, password, role, assistant_persona 
                FROM ai_assistant.users 
                WHERE username = :u
            """), {"u": username}).fetchone()
            if row and row.password == password:
                return {
                    "username": row.username,
                    "role": row.role,
                    "assistant_persona": row.assistant_persona or ""
                }
    except Exception as e:
        logger.error(f"Error authenticate_user: {e}")
    return None

def change_user_password(username: str, old_password: str, new_password: str):
    """Ubah password user yang sedang login."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT password FROM ai_assistant.users WHERE username = :u
            """), {"u": username}).fetchone()

            if not row:
                return {"success": False, "message": "User tidak ditemukan."}

            if row.password != old_password:
                return {"success": False, "message": "Password lama salah."}

            conn.execute(text("""
                UPDATE ai_assistant.users SET password = :new_p WHERE username = :u
            """), {"new_p": new_password, "u": username})
            conn.commit()
            return {"success": True, "message": "Password berhasil diperbarui."}
    except Exception as e:
        logger.error(f"Error change_user_password: {e}")
        return {"success": False, "message": f"Gagal mengubah password: {str(e)}"}

def get_user_by_username(username: str):
    """Ambil detail user berdasarkan username."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT username, role, assistant_persona 
                FROM ai_assistant.users 
                WHERE username = :u
            """), {"u": username}).fetchone()
            if row:
                return {
                    "username": row.username,
                    "role": row.role,
                    "assistant_persona": row.assistant_persona or ""
                }
    except Exception as e:
        logger.error(f"Error get_user_by_username: {e}")
    return None

def update_user_persona(username: str, persona: str):
    """Update persona milik user tertentu."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE ai_assistant.users 
                SET assistant_persona = :p 
                WHERE username = :u
            """), {"p": persona, "u": username})
            conn.commit()
            return True
    except Exception as e:
        logger.error(f"Error update_user_persona: {e}")
        return False

def get_system_config():
    """Ambil konfigurasi MCP SAP dan MCP RAG dari database."""
    sap_cfg = settings.mcp_sap_config_json
    rag_cfg = settings.mcp_rag_config_json
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT key, value FROM ai_assistant.system_config")).fetchall()
            for r in rows:
                if r.key == 'mcp_sap_config_json' and r.value:
                    sap_cfg = r.value
                elif r.key == 'mcp_rag_config_json' and r.value:
                    rag_cfg = r.value
    except Exception as e:
        logger.error(f"Error get_system_config: {e}")
    return {
        "mcp_sap_config_json": sap_cfg,
        "mcp_rag_config_json": rag_cfg
    }

def update_system_config(mcp_sap_json: str, mcp_rag_json: str):
    """Update konfigurasi MCP SAP & MCP RAG di database."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO ai_assistant.system_config (key, value) 
                VALUES ('mcp_sap_config_json', :val)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """), {"val": mcp_sap_json})
            
            conn.execute(text("""
                INSERT INTO ai_assistant.system_config (key, value) 
                VALUES ('mcp_rag_config_json', :val)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """), {"val": mcp_rag_json})
            
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
                WHERE username = :u
                ORDER BY updated_at DESC
            """), {"u": username}).fetchall()
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
                WHERE session_id = :sid AND username = :u
            """), {"sid": session_id, "u": username})
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