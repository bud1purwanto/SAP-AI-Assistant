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
                text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'ai_assistant_dev'")
            )
        }
    assert {"users", "chat_sessions", "chat_messages", "generated_artifacts"} <= tables


def test_usage_pesan_ai_disimpan_dan_dimuat_kembali(db):
    session = db.create_chat_session("TRSTDEV", "Audit Token", oidc_sub="trstdev-sub")
    usage = '{"prompt_tokens":120,"completion_tokens":30,"total_tokens":150,"estimated":false}'

    message_id = db.add_chat_message(
        session["session_id"], "ai", "Jawaban", usage=usage
    )
    messages = db.get_chat_messages(session["session_id"], oidc_sub="trstdev-sub")

    assert message_id
    assert messages[-1]["usage"] == usage


def test_title_session_awal_memakai_pertanyaan_dan_diperbarui_jawaban_ai(db):
    """Prompt awal langsung menjadi judul teks awal; saat AI pertama menjawab, judul diperbarui dengan ringkasan."""
    session = db.create_chat_session("TRSTDEV", "Percakapan Baru", oidc_sub="trstdev-sub")
    assert db.add_chat_message(session["session_id"], "user", "Tolong cek stok material 100-100 di plant 1000")

    sebelum_jawaban = db.get_chat_sessions("trstdev-sub", username="TRSTDEV")
    match_sebelum = [s for s in sebelum_jawaban if s["session_id"] == session["session_id"]][0]
    assert match_sebelum["title"] == "Tolong cek stok material 100-100 di plant 1000"

    jawaban = "## Ringkasan Status Purchase Order\n\nPO terbuka sudah dipetakan berdasarkan tanggal kirim."
    assert db.add_chat_message(session["session_id"], "ai", jawaban)

    sessions = db.get_chat_sessions("trstdev-sub", username="TRSTDEV")
    match = [s for s in sessions if s["session_id"] == session["session_id"]][0]
    assert match["title"] == "Ringkasan Status Purchase Order"


def test_title_manual_tidak_ditimpa_oleh_jawaban_ai_berikutnya(db):
    session = db.create_chat_session("TRSTDEV", "Judul dari pengguna", oidc_sub="trstdev-sub")
    db.rename_chat_session(session["session_id"], "trstdev-sub", "Judul dari pengguna")
    assert db.add_chat_message(session["session_id"], "ai", "## Ringkasan yang tidak boleh mengganti judul")

    sessions = db.get_chat_sessions("trstdev-sub", username="TRSTDEV")
    match = [s for s in sessions if s["session_id"] == session["session_id"]][0]
    assert match["title"] == "Judul dari pengguna"


def test_title_summary_kustom_dan_tidak_berubah_pada_giliran_berikutnya(db):
    """Ringkasan judul dipakai saat giliran AI pertama dan tetap stabil pada giliran kedua."""
    session = db.create_chat_session("TRSTDEV", "Percakapan Baru", oidc_sub="trstdev-sub")
    db.add_chat_message(session["session_id"], "user", "Pertanyaan pertama user")

    # Giliran AI pertama dengan summary_title eksplisit
    db.add_chat_message(session["session_id"], "ai", "Jawaban panjang AI pertama", summary_title="Ringkasan Topik Diskusi")
    sessions = db.get_chat_sessions("trstdev-sub", username="TRSTDEV")
    match = [s for s in sessions if s["session_id"] == session["session_id"]][0]
    assert match["title"] == "Ringkasan Topik Diskusi"

    # Giliran kedua: user bertanya lagi dan AI menjawab lagi
    db.add_chat_message(session["session_id"], "user", "Pertanyaan kedua user")
    db.add_chat_message(session["session_id"], "ai", "## Jawaban AI Kedua Yang Tidak Boleh Merusak Judul", summary_title="Judul Lain")
    sessions_after = db.get_chat_sessions("trstdev-sub", username="TRSTDEV")
    match_after = [s for s in sessions_after if s["session_id"] == session["session_id"]][0]
    assert match_after["title"] == "Ringkasan Topik Diskusi"


def test_delete_reports_failure_when_nothing_was_deleted(db):
    assert db.delete_chat_session("session_tidak_ada", "TRSTDEV") is False


def test_backend_is_postgres(db):
    assert db.get_backend_info()["engine"] == "postgresql"


