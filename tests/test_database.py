"""Perilaku lapisan database yang mudah rusak diam-diam."""
from sqlalchemy import text


def test_init_db_is_idempotent(db):
    """DDL migrasi pernah membatalkan seluruh transaksi di PostgreSQL."""
    db.init_db()
    db.init_db()

    with db.get_engine().connect() as conn:
        tables = {
            r[0]
            for r in conn.execute(
                text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'ai_assistant'")
            )
        }
    assert {"users", "chat_sessions", "chat_messages", "generated_artifacts"} <= tables


def test_message_title_truncation_works(db, client, admin_auth):
    """Judul dipotong di Python; SUBSTRING(x FROM a FOR b) khusus PostgreSQL."""
    session = db.create_chat_session("TRSTDEV", "Percakapan Baru")
    long_text = "P" * 200
    assert db.add_chat_message(session["session_id"], "user", long_text)

    sessions = db.get_chat_sessions("TRSTDEV")
    match = [s for s in sessions if s["session_id"] == session["session_id"]][0]
    assert 0 < len(match["title"]) <= 40


def test_delete_reports_failure_when_nothing_was_deleted(db):
    assert db.delete_chat_session("session_tidak_ada", "TRSTDEV") is False


def test_backend_is_postgres(db):
    assert db.get_backend_info()["engine"] == "postgresql"


def test_legacy_plaintext_password_upgrades_to_hash(db):
    """Instalasi lama menyimpan password apa adanya."""
    with db.get_engine().connect() as conn:
        conn.execute(
            text(
                "INSERT INTO ai_assistant.users (username, password, role, assistant_persona) "
                "VALUES ('warisan', 'rahasia123', 'user', '')"
            )
        )
        conn.commit()

    assert db.authenticate_user("warisan", "rahasia123") is not None

    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT password, password_hash FROM ai_assistant.users WHERE username = 'warisan'")
        ).fetchone()
    assert row.password_hash.startswith("$2b$") and not row.password
    assert db.authenticate_user("warisan", "rahasia123") is not None
