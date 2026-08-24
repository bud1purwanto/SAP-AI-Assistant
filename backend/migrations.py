"""Migrasi skema database.

Sebelum berkas ini ada, setiap perubahan skema ditulis sebagai pernyataan DDL
idempoten di dalam `init_db()` yang dijalankan ulang pada tiap startup. Pola itu
aman untuk `CREATE TABLE IF NOT EXISTS`, tetapi tidak untuk perubahan yang
mengubah data — konversi TIMESTAMP -> TIMESTAMPTZ, misalnya, akan menggeser
seluruh nilai sebesar offset zona waktu setiap kali aplikasi dinyalakan.

Migrasi di sini dicatat dalam tabel `schema_migrations`, sehingga masing-masing
hanya dijalankan sekali seumur hidup database.

CATATAN PENTING UNTUK MIGRASI YANG DIPINDAHKAN KE SINI
------------------------------------------------------
Server yang sudah berjalan lebih dulu mungkin telah menjalankan perubahan itu
lewat `init_db()` versi lama, sementara catatannya belum ada. Karena itu migrasi
pindahan tetap memeriksa keadaan database sebelum bertindak — catatan kosong
tidak boleh diartikan sebagai "belum pernah dijalankan".
"""
import logging

from sqlalchemy import text

logger = logging.getLogger(__name__)


def _ensure_ledger(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.schema_migrations (
            name        VARCHAR(120) PRIMARY KEY,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """))


def _applied(conn) -> set:
    rows = conn.execute(text("SELECT name FROM ai_assistant.schema_migrations")).fetchall()
    return {r[0] for r in rows}


# ---------------------------------------------------------------------------
# Daftar migrasi
# ---------------------------------------------------------------------------

def _m0001_waktu_percakapan_pakai_zona_waktu(conn):
    """Kolom waktu percakapan: TIMESTAMP polos -> TIMESTAMPTZ.

    Tanpa zona waktu, browser membaca nilainya sebagai waktu lokal: percakapan
    yang dibuat pagi hari WIB (masih tanggal sebelumnya di UTC) muncul di
    kelompok "Kemarin" padahal baru saja dipakai. Nilai lama ditafsirkan memakai
    zona waktu server yang dahulu menulisnya — itulah arti sebenarnya dari angka
    tersebut.
    """
    for tabel, kolom in (
        ("chat_sessions", "created_at"),
        ("chat_sessions", "updated_at"),
        ("chat_messages", "created_at"),
    ):
        # Lihat penjelasan di kepala berkas: database yang sudah dikonversi oleh
        # init_db() versi lama tidak boleh dikonversi untuk kedua kalinya.
        masih_polos = conn.execute(text("""
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'ai_assistant'
              AND table_name = :t
              AND column_name = :c
              AND data_type = 'timestamp without time zone'
        """), {"t": tabel, "c": kolom}).fetchone()
        if not masih_polos:
            continue

        logger.info(f"Mengubah ai_assistant.{tabel}.{kolom} menjadi TIMESTAMPTZ.")
        conn.execute(text(f"""
            ALTER TABLE ai_assistant.{tabel}
            ALTER COLUMN {kolom} TYPE TIMESTAMPTZ
            USING {kolom} AT TIME ZONE current_setting('TimeZone')
        """))
        conn.execute(text(f"""
            ALTER TABLE ai_assistant.{tabel}
            ALTER COLUMN {kolom} SET DEFAULT CURRENT_TIMESTAMP
        """))


def _m0002_indeks_pencarian_riwayat(conn):
    """Indeks untuk pencarian riwayat percakapan.

    Pencarian memakai ILIKE '%kata%' yang tidak dapat memanfaatkan indeks B-tree.
    Ekstensi pg_trgm menyediakan indeks GIN yang cocok untuk pola tersebut.
    Pembuatan ekstensi memerlukan hak superuser; bila tidak tersedia, pencarian
    tetap berjalan lewat sequential scan sehingga kegagalannya tidak fatal.
    """
    try:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    except Exception as e:
        logger.warning(
            f"Ekstensi pg_trgm tidak dapat dibuat ({e}); pencarian riwayat tetap "
            "berfungsi tanpa indeks khusus."
        )
        return

    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
        ON ai_assistant.chat_messages USING GIN (content gin_trgm_ops)
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_sessions_title_trgm
        ON ai_assistant.chat_sessions USING GIN (title gin_trgm_ops)
    """))


def _m0003_indeks_feedback(conn):
    """Layar admin membaca pesan ber-feedback; tanpa indeks ini ia memindai
    seluruh tabel pesan yang jumlahnya terus bertambah."""
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_messages_feedback
        ON ai_assistant.chat_messages (feedback, id DESC)
        WHERE feedback IS NOT NULL AND feedback <> ''
    """))


MIGRATIONS = [
    ("0001_waktu_percakapan_pakai_zona_waktu", _m0001_waktu_percakapan_pakai_zona_waktu),
    ("0002_indeks_pencarian_riwayat", _m0002_indeks_pencarian_riwayat),
    ("0003_indeks_feedback", _m0003_indeks_feedback),
]


def run_migrations(conn) -> list:
    """Jalankan migrasi yang belum tercatat. Mengembalikan nama yang diterapkan.

    Dipanggil dengan koneksi yang sama seperti pembuatan tabel di `init_db()`,
    dan pemanggil yang melakukan commit.
    """
    _ensure_ledger(conn)
    sudah = _applied(conn)

    diterapkan = []
    for nama, fungsi in MIGRATIONS:
        if nama in sudah:
            continue
        logger.info(f"Menjalankan migrasi {nama}…")
        fungsi(conn)
        conn.execute(
            text("INSERT INTO ai_assistant.schema_migrations (name) VALUES (:n)"),
            {"n": nama},
        )
        diterapkan.append(nama)

    if diterapkan:
        logger.info(f"Migrasi selesai: {', '.join(diterapkan)}")
    return diterapkan
