"""Ledger migrasi skema.

Konversi TIMESTAMP -> TIMESTAMPTZ adalah alasan berkas ini ada: dijalankan dua
kali, ia menggeser seluruh nilai waktu sebesar offset zona waktu. Pengujian di
sini memastikan setiap migrasi hanya berjalan sekali, dan tetap aman pada
database yang sudah terlanjur dikonversi oleh init_db() versi lama.
"""
from sqlalchemy import text

from database import get_engine, init_db
from migrations import MIGRATIONS, run_migrations


def _ledger(conn):
    rows = conn.execute(text("SELECT name FROM ai_assistant.schema_migrations")).fetchall()
    return {r[0] for r in rows}


def test_semua_migrasi_tercatat_setelah_init(db):
    with get_engine().connect() as conn:
        assert _ledger(conn) == {nama for nama, _ in MIGRATIONS}


def test_migrasi_tidak_dijalankan_dua_kali(db):
    with get_engine().connect() as conn:
        diterapkan = run_migrations(conn)
        conn.commit()
    assert diterapkan == [], "migrasi yang sudah tercatat tidak boleh dijalankan lagi"


def test_kolom_waktu_bertipe_timestamptz(db):
    with get_engine().connect() as conn:
        for tabel, kolom in (
            ("chat_sessions", "created_at"),
            ("chat_sessions", "updated_at"),
            ("chat_messages", "created_at"),
        ):
            tipe = conn.execute(text("""
                SELECT data_type FROM information_schema.columns
                WHERE table_schema='ai_assistant' AND table_name=:t AND column_name=:c
            """), {"t": tabel, "c": kolom}).scalar()
            assert tipe == "timestamp with time zone", f"{tabel}.{kolom} bertipe {tipe}"


def test_migrasi_pindahan_aman_pada_database_yang_sudah_dikonversi(db):
    """Server yang sudah berjalan telah menjalankan konversi lewat init_db()
    versi lama, tetapi catatannya belum ada. Ledger yang kosong tidak boleh
    diartikan sebagai 'belum pernah dijalankan'."""
    engine = get_engine()
    with engine.connect() as conn:
        sebelum = conn.execute(text(
            "SELECT updated_at FROM ai_assistant.chat_sessions ORDER BY updated_at DESC LIMIT 1"
        )).scalar()

        # Hapus catatannya, seolah database ini berasal dari versi sebelum ledger ada.
        conn.execute(text("DELETE FROM ai_assistant.schema_migrations"))
        conn.commit()

    init_db()

    with engine.connect() as conn:
        assert _ledger(conn) == {nama for nama, _ in MIGRATIONS}
        sesudah = conn.execute(text(
            "SELECT updated_at FROM ai_assistant.chat_sessions ORDER BY updated_at DESC LIMIT 1"
        )).scalar()
    assert sesudah == sebelum, "nilai waktu bergeser saat migrasi dijalankan ulang"


def test_nama_migrasi_unik_dan_berurutan(db):
    nama = [n for n, _ in MIGRATIONS]
    assert len(nama) == len(set(nama)), "nama migrasi harus unik"
    assert nama == sorted(nama), "migrasi dijalankan berurutan sesuai penamaannya"
