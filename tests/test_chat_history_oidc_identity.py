"""Regresi kepemilikan riwayat chat berbasis sub OIDC."""
import uuid

from sqlalchemy import text


def _buat_sesi_legacy(db, username: str, title: str) -> str:
    session_id = f"legacy-{uuid.uuid4().hex[:12]}"
    with db.get_engine().connect() as conn:
        conn.execute(text("""
            INSERT INTO ai_assistant_dev.chat_sessions (session_id, username, title)
            VALUES (:sid, :username, :title)
        """), {"sid": session_id, "username": username, "title": title})
        conn.commit()
    return session_id



def test_riwayat_tetap_terbaca_saat_username_oidc_berubah(db):
    oidc_sub = "user-stabil-001"
    session = db.create_chat_session("nama-lama", "Riwayat OIDC", oidc_sub=oidc_sub)
    assert session
    assert db.add_chat_message(session["session_id"], "user", "Catatan yang harus tetap ada")

    sessions = db.get_chat_sessions(oidc_sub, username="nama-baru")

    assert [item["session_id"] for item in sessions] == [session["session_id"]]
    assert db.get_chat_messages(session["session_id"], oidc_sub=oidc_sub)
    assert not db.get_chat_messages(session["session_id"], oidc_sub="sub-pengguna-lain")


def test_sesi_legacy_diklaim_oleh_sub_oidc_pada_login_username_yang_sama(db):
    session_id = _buat_sesi_legacy(db, "nama-lama", "Riwayat Lama")
    assert db.add_chat_message(session_id, "user", "Riwayat sebelum migrasi")

    sessions = db.get_chat_sessions("user-stabil-002", username="nama-lama")

    assert [item["session_id"] for item in sessions] == [session_id]
    assert db.session_belongs_to(session_id, "user-stabil-002")
    assert not db.session_belongs_to(session_id, "sub-pengguna-lain")


def test_sesi_legacy_tidak_diklaim_jika_username_tidak_cocok(db):
    session_id = _buat_sesi_legacy(db, "nama-lama", "Riwayat Lama")
    assert db.add_chat_message(session_id, "user", "Riwayat sebelum migrasi")

    assert db.get_chat_sessions("sub-baru", username="nama-baru") == []
    assert not db.session_belongs_to(session_id, "sub-baru")
