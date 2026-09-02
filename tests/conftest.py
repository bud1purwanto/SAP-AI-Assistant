"""Fixture bersama untuk pengujian backend.

Seluruh pengujian berjalan di atas PostgreSQL sungguhan — sama seperti
produksi. Schema `ai_assistant` dibuat ulang untuk setiap modul uji agar
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
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "AdminPass123")
os.environ.setdefault("GUEST_DAILY_LIMIT", "2")

ADMIN_USER = "TRSTDEV"
ADMIN_PASSWORD = "AdminPass123"


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
            "Pengujian pytest menjalankan 'DROP SCHEMA ai_assistant CASCADE'. "
            "Database pengujian WAJIB memiliki nama berakhiran '_test' (contoh: ABAP_DB_TEST) "
            "untuk mencegah data operasional terhapus secara tidak sengaja."
        )

    # 2. Cek indikator database produksi
    for hint in FORBIDDEN_DB_HINTS:
        if hint in target:
            raise RuntimeError(
                f"TEST_DATABASE_URL menunjuk ke '{target}', yang tampak seperti database "
                "produksi. Pengujian menghapus schema ai_assistant — arahkan ke database "
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
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS ai_assistant CASCADE"))
        conn.commit()
    database.init_db()


@pytest.fixture(scope="module")
def db():
    """Database bersih dengan schema dan user bootstrap."""
    _reset_schema()
    import database

    return database


@pytest.fixture(scope="module")
def client(db):
    """TestClient FastAPI di atas database bersih."""
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_auth(client):
    res = client.post("/api/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def make_user(client, admin_auth):
    """Buat user baru dan kembalikan header Authorization-nya."""
    created = []

    def _make(username, password="Passw0rd123", **kwargs):
        payload = {"username": username, "password": password, "role": "user", **kwargs}
        res = client.post("/api/admin/users", json=payload, headers=admin_auth)
        assert res.status_code == 200, res.text
        created.append(username)
        login = client.post("/api/login", json={"username": username, "password": password})
        assert login.status_code == 200, login.text
        return {"Authorization": f"Bearer {login.json()['access_token']}"}

    yield _make

    for username in created:
        client.delete(f"/api/admin/users/{username}", headers=admin_auth)
