"""
Migrasi Data dari SQLite ke PostgreSQL (SAP AI Assistant)
=========================================================
Script ini digunakan untuk memindahkan data (users, system_config,
chat_sessions, chat_messages) dari file SQLite lokal ke database PostgreSQL.
"""

import os
import sys
import argparse
from pathlib import Path
from sqlalchemy import create_engine, text
from config import settings
import database

def migrate_sqlite_to_postgres(sqlite_path: str = "sap_ai_assistant.db"):
    sqlite_file = Path(sqlite_path)
    if not sqlite_file.exists():
        print(f"[-] File SQLite '{sqlite_path}' tidak ditemukan.")
        print("[i] Saat ini aplikasi telah langsung terhubung ke PostgreSQL.")
        return False

    print(f"[+] Menemukan file SQLite: {sqlite_file.resolve()}")
    sqlite_engine = create_engine(f"sqlite:///{sqlite_file.resolve()}")
    
    # Inisialisasi PostgreSQL
    pg_engine = database.get_engine()
    if database._using_sqlite:
        print("[-] Gagal terhubung ke PostgreSQL. Pastikan PostgreSQL berjalan dan konfigurasi DATABASE_URL benar.")
        return False

    database.init_db()
    print(f"[+] Terhubung ke PostgreSQL: {settings.database_url}")

    with sqlite_engine.connect() as sq_conn, pg_engine.connect() as pg_conn:
        # 1. Migrasi users
        try:
            sq_users = sq_conn.execute(text("SELECT username, password, role, assistant_persona FROM users")).fetchall()
            print(f"[i] Ditemukan {len(sq_users)} user di SQLite.")
            for u in sq_users:
                pg_conn.execute(text("""
                    INSERT INTO ai_assistant.users (username, password, role, assistant_persona)
                    VALUES (:u, :p, :r, :persona)
                    ON CONFLICT (username) DO UPDATE SET
                        password = EXCLUDED.password,
                        role = EXCLUDED.role,
                        assistant_persona = COALESCE(EXCLUDED.assistant_persona, ai_assistant.users.assistant_persona)
                """), {"u": u.username, "p": u.password, "r": u.role, "persona": u.assistant_persona or ""})
            pg_conn.commit()
            print("[✓] Users berhasil dimigrasikan.")
        except Exception as e:
            print(f"[!] Info/Skip migrasi users: {e}")

        # 2. Migrasi system_config
        try:
            sq_configs = sq_conn.execute(text("SELECT key, value FROM system_config")).fetchall()
            print(f"[i] Ditemukan {len(sq_configs)} config di SQLite.")
            for c in sq_configs:
                pg_conn.execute(text("""
                    INSERT INTO ai_assistant.system_config (key, value)
                    VALUES (:k, :v)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """), {"k": c.key, "v": c.value})
            pg_conn.commit()
            print("[✓] System Config berhasil dimigrasikan.")
        except Exception as e:
            print(f"[!] Info/Skip migrasi config: {e}")

        # 3. Migrasi chat_sessions
        try:
            sq_sessions = sq_conn.execute(text("SELECT session_id, username, title, created_at, updated_at FROM chat_sessions")).fetchall()
            print(f"[i] Ditemukan {len(sq_sessions)} chat sessions di SQLite.")
            for s in sq_sessions:
                pg_conn.execute(text("""
                    INSERT INTO ai_assistant.chat_sessions (session_id, username, title, created_at, updated_at)
                    VALUES (:sid, :u, :t, :cat, :uat)
                    ON CONFLICT (session_id) DO UPDATE SET
                        title = EXCLUDED.title,
                        updated_at = EXCLUDED.updated_at
                """), {
                    "sid": s.session_id,
                    "u": s.username,
                    "t": s.title,
                    "cat": s.created_at,
                    "uat": s.updated_at
                })
            pg_conn.commit()
            print("[✓] Chat Sessions berhasil dimigrasikan.")
        except Exception as e:
            print(f"[!] Info/Skip migrasi chat_sessions: {e}")

        # 4. Migrasi chat_messages
        try:
            sq_msgs = sq_conn.execute(text("SELECT session_id, role, content, sources, created_at FROM chat_messages")).fetchall()
            print(f"[i] Ditemukan {len(sq_msgs)} chat messages di SQLite.")
            for m in sq_msgs:
                pg_conn.execute(text("""
                    INSERT INTO ai_assistant.chat_messages (session_id, role, content, sources, created_at)
                    VALUES (:sid, :r, :c, :s, :cat)
                """), {
                    "sid": m.session_id,
                    "r": m.role,
                    "c": m.content,
                    "s": m.sources or "",
                    "cat": m.created_at
                })
            pg_conn.commit()
            print("[✓] Chat Messages berhasil dimigrasikan.")
        except Exception as e:
            print(f"[!] Info/Skip migrasi chat_messages: {e}")

    print("\n[🎉] Proses migrasi selesai dengan sukses!")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrasi database SQLite ke PostgreSQL.")
    parser.add_argument("--sqlite-path", default="sap_ai_assistant.db", help="Path file SQLite")
    args = parser.parse_args()
    
    migrate_sqlite_to_postgres(args.sqlite_path)
