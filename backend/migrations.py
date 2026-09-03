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


def _m0004_peran_abaper_dan_functional(conn):
    """Perluas daftar peran: abaper, functional, dan user biasa.

    Sebelumnya hanya ada 'superadmin', 'user', dan 'guest'. Peran 'user' lama
    dipakai oleh para pengembang ABAP, jadi seluruhnya dipindahkan ke 'abaper'
    agar hak ubah programnya tetap sesuai. Peran 'functional' dan 'user' yang
    baru dimulai tanpa hak tersebut.

    Migrasi ini hanya boleh berjalan sekali: menjalankannya lagi setelah admin
    sengaja menurunkan seseorang menjadi 'user' akan menaikkannya kembali
    menjadi 'abaper' tanpa diminta.
    """
    jumlah = conn.execute(text("""
        UPDATE ai_assistant.users SET role = 'abaper' WHERE role = 'user'
    """)).rowcount
    logger.info(f"{jumlah} pengguna dipindahkan dari peran 'user' ke 'abaper'.")


def _m0005_kuota_token(conn):
    """Pencatatan pemakaian token per pengguna per hari, dan batas per peran."""
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.token_usage (
            username        VARCHAR(80)  NOT NULL,
            usage_date      VARCHAR(10)  NOT NULL,
            prompt_tokens   BIGINT       NOT NULL DEFAULT 0,
            completion_tokens BIGINT     NOT NULL DEFAULT 0,
            total_tokens    BIGINT       NOT NULL DEFAULT 0,
            requests        INTEGER      NOT NULL DEFAULT 0,
            -- Sebagian provider tidak melaporkan pemakaian token. Nilai untuk
            -- permintaan seperti itu diperkirakan sendiri, dan penandanya
            -- disimpan supaya angkanya tidak disajikan seolah-olah terukur.
            estimated       BOOLEAN      NOT NULL DEFAULT FALSE,
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (username, usage_date)
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_token_usage_tanggal
        ON ai_assistant.token_usage (usage_date DESC, total_tokens DESC)
    """))

    # Jejak per permintaan untuk pembatasan per menit.
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.request_log (
            id          BIGSERIAL PRIMARY KEY,
            username    VARCHAR(80) NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_request_log_user_waktu
        ON ai_assistant.request_log (LOWER(username), created_at DESC)
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.role_limits (
            role                VARCHAR(30) PRIMARY KEY,
            daily_token_limit   BIGINT      NOT NULL DEFAULT 0,
            per_minute_limit    INTEGER     NOT NULL DEFAULT 0,
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """))

    # Nilai awal. 0 berarti TANPA BATAS — dipakai untuk superadmin.
    for peran, harian, per_menit in (
        ("superadmin", 0, 0),
        ("abaper", 1_000_000, 10),
        ("functional", 500_000, 10),
        ("user", 300_000, 8),
        ("guest", 50_000, 5),
    ):
        conn.execute(text("""
            INSERT INTO ai_assistant.role_limits (role, daily_token_limit, per_minute_limit)
            VALUES (:r, :h, :m)
            ON CONFLICT (role) DO NOTHING
        """), {"r": peran, "h": harian, "m": per_menit})


def _m0006_mode_chat(conn):
    """Tabel konfigurasi mode chat AI dan perizinan akses mode per role pengguna."""
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.chat_modes (
            id SERIAL PRIMARY KEY,
            code VARCHAR(40) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            description VARCHAR(255) DEFAULT '',
            icon VARCHAR(40) DEFAULT 'zap',
            provider VARCHAR(40) DEFAULT 'nine_router',
            model VARCHAR(150) DEFAULT 'ag/gemini-3.7-flash-medium',
            fallback_provider VARCHAR(40) DEFAULT 'openrouter',
            fallback_model VARCHAR(150) DEFAULT 'openrouter/free',
            max_iterations INTEGER NOT NULL DEFAULT 15,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.role_modes (
            role VARCHAR(40) NOT NULL,
            mode_code VARCHAR(40) NOT NULL REFERENCES ai_assistant.chat_modes(code) ON UPDATE CASCADE ON DELETE CASCADE,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (role, mode_code)
        )
    """))

    # Seed Default Chat Modes
    initial_modes = [
        ("fast", "Fast", "For everyday tasks & quick answers", "zap", "nine_router", "ag/gemini-3.7-flash-medium", "openrouter", "openrouter/free", 10, True, True, 1),
        ("medium", "Medium", "For complex tasks & data analysis", "gauge", "nine_router", "ag/gemini-3.7-flash-medium", "openrouter", "openrouter/free", 15, True, False, 2),
        ("expert", "Expert", "For toughest challenges & in-depth reasoning", "brain", "nine_router", "ag/gemini-3.7-flash-medium", "openrouter", "openrouter/free", 25, True, False, 3),
    ]

    for code, name, desc, icon, provider, model, fb_prov, fb_model, max_iter, enabled, is_default, order in initial_modes:
        conn.execute(text("""
            INSERT INTO ai_assistant.chat_modes
                (code, name, description, icon, provider, model, fallback_provider, fallback_model, max_iterations, enabled, is_default, sort_order)
            VALUES
                (:c, :n, :d, :i, :p, :m, :fbp, :fbm, :mi, :en, :def, :ord)
            ON CONFLICT (code) DO NOTHING
        """), {
            "c": code, "n": name, "d": desc, "i": icon,
            "p": provider, "m": model, "fbp": fb_prov, "fbm": fb_model,
            "mi": max_iter, "en": enabled, "def": is_default, "ord": order
        })

    # Seed Role Permissions
    role_permissions = [
        ("superadmin", "fast", True),
        ("superadmin", "medium", True),
        ("superadmin", "expert", True),
        ("abaper", "fast", True),
        ("abaper", "medium", True),
        ("abaper", "expert", True),
        ("functional", "fast", True),
        ("functional", "medium", True),
        ("functional", "expert", False),
        ("user", "fast", True),
        ("user", "medium", True),
        ("user", "expert", False),
        ("guest", "fast", True),
        ("guest", "medium", False),
        ("guest", "expert", False),
    ]

    for role, code, enabled in role_permissions:
        conn.execute(text("""
            INSERT INTO ai_assistant.role_modes (role, mode_code, enabled)
            VALUES (:r, :c, :en)
            ON CONFLICT (role, mode_code) DO NOTHING
        """), {"r": role, "c": code, "en": enabled})

    # Seed Master Switch
    conn.execute(text("""
        INSERT INTO ai_assistant.system_config (key, value)
        VALUES ('chat_modes_enabled', 'true')
        ON CONFLICT (key) DO NOTHING
    """))



def _m0007_akses_mcp_per_user(conn):
    """Katalog resource MCP dan kontrol otorisasi akses per peran serta per pengguna."""
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.mcp_resources (
            resource_key   VARCHAR(80) PRIMARY KEY,
            kind           VARCHAR(20) NOT NULL,
            label          VARCHAR(120) NOT NULL,
            sid            VARCHAR(20) NOT NULL DEFAULT '',
            client         VARCHAR(10) NOT NULL DEFAULT '',
            is_production  BOOLEAN NOT NULL DEFAULT FALSE,
            first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            archived       BOOLEAN NOT NULL DEFAULT FALSE
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.role_resource_access (
            role          VARCHAR(40) NOT NULL,
            resource_key  VARCHAR(80) NOT NULL REFERENCES ai_assistant.mcp_resources(resource_key) ON UPDATE CASCADE ON DELETE CASCADE,
            allowed       BOOLEAN NOT NULL DEFAULT FALSE,
            can_write     BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (role, resource_key)
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.user_resource_access (
            username      VARCHAR(80) NOT NULL,
            resource_key  VARCHAR(80) NOT NULL REFERENCES ai_assistant.mcp_resources(resource_key) ON UPDATE CASCADE ON DELETE CASCADE,
            allowed       BOOLEAN NOT NULL DEFAULT FALSE,
            can_write     BOOLEAN NOT NULL DEFAULT FALSE,
            valid_until   TIMESTAMPTZ,
            granted_by    VARCHAR(80),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (username, resource_key)
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_user_res_access_user
        ON ai_assistant.user_resource_access (LOWER(username));
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.access_audit (
            id            BIGSERIAL PRIMARY KEY,
            actor         VARCHAR(80) NOT NULL,
            target_type   VARCHAR(20) NOT NULL,
            target_id     VARCHAR(80) NOT NULL,
            resource_key  VARCHAR(80),
            action        VARCHAR(50) NOT NULL,
            detail        TEXT NOT NULL DEFAULT '',
            created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_access_audit_created
        ON ai_assistant.access_audit (created_at DESC);
    """))

    # Seed Master Switch: default 'false' (OFF) agar transisi aman
    conn.execute(text("""
        INSERT INTO ai_assistant.system_config (key, value)
        VALUES ('mcp_access_control_enabled', 'false')
        ON CONFLICT (key) DO NOTHING
    """))

    # Seed Sumber Daya MCP Standar yang dikenal
    default_resources = [
        # (key, kind, label, sid, client, is_production)
        ("service:rag", "service", "Manufacturing RAG Knowledge Base", "", "", False),
        ("service:email", "service", "MCP Email Service", "", "", False),
        ("sap:sandbox-new", "sap", "Sandbox New Company", "TRS", "130", False),
        ("sap:sandbox", "sap", "Sandbox Build Competence", "TRD", "140", False),
        ("sap:dev-aix", "sap", "Development AIX", "TRD", "130", False),
        ("sap:dev-win", "sap", "Development Windows", "TRD", "130", False),
        ("sap:qa", "sap", "QA System", "TRQ", "320", False),
        ("sap:prod-aix", "sap", "Production AIX", "PRT", "999", True),
        ("sap:prod-win", "sap", "Production Windows", "TRP", "999", True),
    ]

    for r_key, r_kind, r_label, r_sid, r_client, r_prod in default_resources:
        conn.execute(text("""
            INSERT INTO ai_assistant.mcp_resources
                (resource_key, kind, label, sid, client, is_production)
            VALUES
                (:k, :kind, :label, :sid, :cli, :prod)
            ON CONFLICT (resource_key) DO UPDATE SET
                label = EXCLUDED.label,
                sid = EXCLUDED.sid,
                client = EXCLUDED.client,
                is_production = EXCLUDED.is_production,
                last_seen_at = CURRENT_TIMESTAMP
        """), {
            "k": r_key, "kind": r_kind, "label": r_label,
            "sid": r_sid, "cli": r_client, "prod": r_prod
        })


def _m0008_peran_ekstra_backend_frontend_basis_data(conn):
    """Mendaftarkan default kuota token dan izin mode chat untuk role baru."""
    # 1. Kuota token default
    for peran, harian, per_menit in (
        ("backend", 1_000_000, 10),
        ("frontend", 500_000, 10),
        ("basis", 1_000_000, 10),
        ("data_analyst", 800_000, 10),
    ):
        conn.execute(text("""
            INSERT INTO ai_assistant.role_limits (role, daily_token_limit, per_minute_limit)
            VALUES (:r, :h, :m)
            ON CONFLICT (role) DO NOTHING
        """), {"r": peran, "h": harian, "m": per_menit})

    # 2. Izin mode chat
    role_permissions = [
        ("backend", "fast", True),
        ("backend", "medium", True),
        ("backend", "expert", True),
        ("frontend", "fast", True),
        ("frontend", "medium", True),
        ("frontend", "expert", False),
        ("basis", "fast", True),
        ("basis", "medium", True),
        ("basis", "expert", True),
        ("data_analyst", "fast", True),
        ("data_analyst", "medium", True),
        ("data_analyst", "expert", True),
    ]
    for role, code, enabled in role_permissions:
        conn.execute(text("""
            INSERT INTO ai_assistant.role_modes (role, mode_code, enabled)
            VALUES (:r, :c, :en)
            ON CONFLICT (role, mode_code) DO NOTHING
        """), {"r": role, "c": code, "en": enabled})


def _m0009_multi_role_pengguna(conn):
    """Tabel relasi peran ganda pengguna (user_roles) dan migrasi data non-destruktif."""
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS ai_assistant.user_roles (
            username   VARCHAR(50) NOT NULL REFERENCES ai_assistant.users(username) ON UPDATE CASCADE ON DELETE CASCADE,
            role       VARCHAR(40) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (username, role)
        );
    """))
    conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_user_roles_username
        ON ai_assistant.user_roles(username);
    """))

    # Migrasi data awal dari tabel users ke user_roles
    conn.execute(text("""
        INSERT INTO ai_assistant.user_roles (username, role)
        SELECT username, role
        FROM ai_assistant.users
        WHERE role IS NOT NULL AND role != ''
        ON CONFLICT (username, role) DO NOTHING;
    """))


def _m0010_seed_skill_sap_mm(conn):
    """Seed modul keahlian SOP SAP MM ke katalog skills."""
    from database import DEFAULT_SKILL_MM
    conn.execute(text("""
        INSERT INTO ai_assistant.skills (name, description, content, enabled)
        VALUES ('SAP MM', 'Panduan modul Materials Management (MM), Purchasing, Vendor, Master Material, dan pembuatan PO via BAPI RFC (BAPI_PO_CREATE1)', :mm_content, true)
        ON CONFLICT (name) DO UPDATE SET
            description = EXCLUDED.description,
            content = EXCLUDED.content;
    """), {"mm_content": DEFAULT_SKILL_MM})


def _m0011_skill_tags(conn):
    """Tambahkan kolom tags pada tabel skills dan seed tags bawaan untuk modul default."""
    conn.execute(text("""
        ALTER TABLE ai_assistant.skills ADD COLUMN IF NOT EXISTS tags text DEFAULT '';
    """))
    conn.execute(text("""
        UPDATE ai_assistant.skills
        SET tags = 'abap, program, coding, se38, se80, bapi, syntax, zprogram, function module, include'
        WHERE name = 'SAP ABAP' AND (tags IS NULL OR tags = '');
    """))
    conn.execute(text("""
        UPDATE ai_assistant.skills
        SET tags = 'pp, produksi, production, slit roll, slitting, bom, routing, work center, afko, co01, zpp001, mrp'
        WHERE name = 'SAP PP' AND (tags IS NULL OR tags = '');
    """))
    conn.execute(text("""
        UPDATE ai_assistant.skills
        SET tags = 'mm, purchasing, po, purchase order, material, vendor, bapi_po_create1, mara, ekko, migo, pr'
        WHERE name = 'SAP MM' AND (tags IS NULL OR tags = '');
    """))


def _m0012_standardize_persona_and_skills(conn):
    """Standarisasi global assistant persona dan bersihkan duplikasi environment di skill default."""
    from database import (
        DEFAULT_GLOBAL_PERSONA,
        DEFAULT_SKILL_ABAP,
        DEFAULT_SKILL_PP,
        DEFAULT_SKILL_MM,
    )
    conn.execute(text("""
        INSERT INTO ai_assistant.system_config (key, value)
        VALUES ('global_assistant_persona', :persona)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    """), {"persona": DEFAULT_GLOBAL_PERSONA})

    conn.execute(text("""
        UPDATE ai_assistant.skills
        SET content = :abap_content
        WHERE name = 'SAP ABAP';
    """), {"abap_content": DEFAULT_SKILL_ABAP})

    conn.execute(text("""
        UPDATE ai_assistant.skills
        SET content = :pp_content
        WHERE name = 'SAP PP';
    """), {"pp_content": DEFAULT_SKILL_PP})

    conn.execute(text("""
        UPDATE ai_assistant.skills
        SET content = :mm_content
        WHERE name = 'SAP MM';
    """), {"mm_content": DEFAULT_SKILL_MM})


MIGRATIONS = [
    ("0001_waktu_percakapan_pakai_zona_waktu", _m0001_waktu_percakapan_pakai_zona_waktu),
    ("0002_indeks_pencarian_riwayat", _m0002_indeks_pencarian_riwayat),
    ("0003_indeks_feedback", _m0003_indeks_feedback),
    ("0004_peran_abaper_dan_functional", _m0004_peran_abaper_dan_functional),
    ("0005_kuota_token", _m0005_kuota_token),
    ("0006_mode_chat", _m0006_mode_chat),
    ("0007_akses_mcp_per_user", _m0007_akses_mcp_per_user),
    ("0008_peran_ekstra_backend_frontend_basis_data", _m0008_peran_ekstra_backend_frontend_basis_data),
    ("0009_multi_role_pengguna", _m0009_multi_role_pengguna),
    ("0010_seed_skill_sap_mm", _m0010_seed_skill_sap_mm),
    ("0011_skill_tags", _m0011_skill_tags),
    ("0012_standardize_persona_and_skills", _m0012_standardize_persona_and_skills),
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
