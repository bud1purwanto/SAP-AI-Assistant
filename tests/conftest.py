"""Fixture bersama untuk pengujian backend.

Seluruh pengujian berjalan di atas PostgreSQL sungguhan — sama seperti
produksi. Schema `ai_assistant_dev` dibuat ulang untuk setiap modul uji agar
hasilnya tidak bergantung pada urutan menjalankan tes.
"""
import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@192.168.1.232:5432/ABAP_DB_TEST",
)

os.environ.setdefault("DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("SESSION_SECRET", "test-session-secret-test-session-secret-1234567890")
os.environ.setdefault("DASHBOARD_OIDC_ISSUER", "http://127.0.0.1:3000")
os.environ.setdefault("DASHBOARD_OIDC_CLIENT_ID", "sap-ai-assistant")
os.environ.setdefault("DASHBOARD_OIDC_REDIRECT_URI", "http://localhost:5173/api/auth/callback")
os.environ.setdefault("DASHBOARD_MCP_GATEWAY_URL", "http://127.0.0.1:3000/api/mcp")
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")

ADMIN_USER = "TRSTDEV"
ADMIN_SUB = "trstdev-dashboard-sub"
os.environ.setdefault("GUEST_DAILY_LIMIT", "2")



# Pengujian menjalankan DROP SCHEMA.
# Guard ketat: Nama database HARUS diakhiri dengan _test atau diawali test_
# dan sama sekali tidak boleh sama dengan DATABASE_URL di backend/.env
FORBIDDEN_DB_HINTS = ("prod", "production", "live")


def _guard_test_database(url: str):
    target = url.rsplit("@", 1)[-1].lower()
    db_name = target.split("/", 1)[-1].split("?")[0].strip().lower()
    
    # 1. Pastikan nama database memiliki suffix / prefix khusus test
    is_test_named = (
        db_name.endswith("_test")
        or db_name.endswith("_tests")
        or db_name.startswith("test_")
        or db_name.startswith("test-")
        or db_name == "test"
    )
    if not is_test_named:
        raise RuntimeError(
            f"KEAMANAN GAGAL: TEST_DATABASE_URL menunjuk ke database '{db_name}'. "
            "Pengujian pytest menjalankan 'DROP SCHEMA ai_assistant_dev CASCADE'. "
            "Database pengujian WAJIB memiliki nama berakhiran '_test' (contoh: ABAP_DB_TEST) "
            "untuk mencegah data operasional terhapus secara tidak sengaja."
        )

    # 2. Cek indikator database produksi
    for hint in FORBIDDEN_DB_HINTS:
        if hint in target:
            raise RuntimeError(
                f"TEST_DATABASE_URL menunjuk ke '{target}', yang tampak seperti database "
                "produksi. Pengujian menghapus schema ai_assistant_dev — arahkan ke database "
                "khusus pengujian."
            )

    # 3. Cek benturan dengan file .env
    backend_env_file = BACKEND / ".env"
    if backend_env_file.exists():
        for line in backend_env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL=") and not line.startswith("#"):
                prod_val = line.split("=", 1)[1].strip().strip('"').strip("'")
                prod_target = prod_val.rsplit("@", 1)[-1].lower()
                if target == prod_target:
                    raise RuntimeError(
                        f"KEAMANAN GAGAL: TEST_DATABASE_URL ({target}) sama persis dengan "
                        f"DATABASE_URL di backend/.env. Pengujian dibatalkan!"
                    )


def _reset_schema():
    from sqlalchemy import text

    import database

    _guard_test_database(TEST_DB_URL)

    engine = database.get_engine()
    engine.dispose()
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS ai_assistant_dev CASCADE"))
        conn.commit()
    database.init_db()


@pytest.fixture(scope="module")
def db():
    """Database bersih dengan schema dan user bootstrap."""
    _reset_schema()
    import database

    yield database
    database.get_engine().dispose()


@pytest.fixture(scope="module")
def client(db):
    """TestClient FastAPI di atas database bersih."""
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_auth():
    """Cookie sesi admin superadmin (signed)."""
    from auth import create_session_cookie

    cookie = create_session_cookie({
        "sub": ADMIN_SUB,
        "username": ADMIN_USER,
        "role": "superadmin",
        "roles": ["superadmin"],
        "org_units": [],
        "is_guest": False,
    })
    return {"Cookie": f"sap_session={cookie}"}


@pytest.fixture
def make_user(db):
    """Buat cookie sesi user (signed). Identitas dikelola Dashboard OIDC."""

    def _make(username, password="Passw0rd123", **kwargs):
        from auth import create_session_cookie, create_access_token
        from sqlalchemy import text

        role = kwargs.get("role", "user")
        roles = kwargs.get("roles", [role])

        # Insert user to database so role checks and FK constraints work
        engine = db.get_engine()
        with engine.connect() as conn:
            conn.execute(
                text("""
                    INSERT INTO ai_assistant_dev.users (username, role)
                    VALUES (:u, :r)
                    ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role
                """),
                {"u": username, "r": role},
            )
            conn.commit()

        access_token = create_access_token(
            username=username,
            role=role,
            roles=roles,
            org_units=kwargs.get("org_units", []),
            is_guest=False,
        )
        cookie = create_session_cookie({
            "sub": username,
            "username": username,
            "role": role,
            "roles": roles,
            "org_units": kwargs.get("org_units", []),
            "is_guest": False,
            "access_token": access_token,
        })
        return {"Cookie": f"sap_session={cookie}"}

    yield _make
