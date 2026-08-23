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
    "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/ABAP_DB",
)

os.environ.setdefault("DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-123")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "AdminPass123")
os.environ.setdefault("GUEST_DAILY_LIMIT", "2")

ADMIN_USER = "TRSTDEV"
ADMIN_PASSWORD = "AdminPass123"


# Pengujian menjalankan DROP SCHEMA. Nama-nama ini menandakan database
# produksi, dan menolaknya lebih murah daripada memulihkan data yang hilang.
FORBIDDEN_DB_HINTS = ("prod", "production", "live")


def _guard_test_database(url: str):
    target = url.rsplit("@", 1)[-1].lower()
    for hint in FORBIDDEN_DB_HINTS:
        if hint in target:
            raise RuntimeError(
                f"TEST_DATABASE_URL menunjuk ke '{target}', yang tampak seperti database "
                "produksi. Pengujian menghapus schema ai_assistant — arahkan ke database "
                "khusus pengujian."
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
