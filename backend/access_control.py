"""Modul Otorisasi dan Kontrol Akses Sumber Daya MCP.

Menyediakan resolusi izin 2 lapis:
1. Template Role (ai_assistant.role_resource_access)
2. Override per User (ai_assistant.user_resource_access) - tri-state (Inherit/Allow/Deny)
3. Fallback: DENY jika master switch 'mcp_access_control_enabled' aktif.

Bila master switch nonaktif (default awal), semua akses tetap diizinkan
seperti perilaku sistem sebelumnya (backward-compatible).
"""
import copy
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple, Union

from fastapi import HTTPException, status
from sqlalchemy import text

import database

logger = logging.getLogger(__name__)


def normalize_roles(role: Union[str, List[str], None]) -> List[str]:
    """Mengonversi role tunggal atau list role menjadi list of lowercase string tanpa duplikasi."""
    if isinstance(role, list):
        res = []
        for r in role:
            if r and str(r).strip().lower() not in res:
                res.append(str(r).strip().lower())
        return res or ["user"]
    elif isinstance(role, str) and role.strip():
        parts = [p.strip().lower() for p in role.split(",") if p.strip()]
        return parts or ["user"]
    return ["user"]


# Cache izin di memori dengan TTL pendek (30 detik) per (username, tuple_roles)
# untuk menjaga latensi tetap rendah pada setiap stream token obrolan.
_ACCESS_CACHE: Dict[Tuple[str, Tuple[str, ...]], Tuple[float, Dict[str, Dict[str, Any]]]] = {}
_CACHE_TTL_SECONDS = 30.0

# Cache role efektif (dari DB, bukan token JWT) per username, TTL pendek.
_ROLES_CACHE: Dict[str, Tuple[float, List[str]]] = {}
_ROLES_CACHE_TTL = 30.0


def invalidate_effective_roles_cache(username: Optional[str] = None):
    """Menghapus cache role efektif. Panggil setelah role user/peran berubah."""
    if username:
        _ROLES_CACHE.pop((username or "").strip().lower(), None)
    else:
        _ROLES_CACHE.clear()


def effective_roles(username: Optional[str], is_guest: bool = False, token_roles: Optional[List[str]] = None) -> List[str]:
    """Mengembalikan role efektif pengguna berdasarkan status TERKINI di database.

    Token JWT hanya menyimpan role pada saat login; role di database bisa berubah
    kapan saja (admin mencabut/menambah role, atau menonaktifkan sebuah role master).
    Fungsi ini adalah satu-satunya sumber kebenaran untuk keputusan otorisasi yang
    tidak boleh menunggu token kedaluwarsa — dipakai di semua endpoint yang menentukan
    resource/mode apa yang terlihat atau bisa dipakai oleh user saat ini.

    Tamu (is_guest=True atau username kosong) langsung memakai token_roles (biasanya ["guest"]),
    karena tidak ada baris di database untuk tamu.
    """
    uname_clean = (username or "").strip().lower()
    if is_guest or not uname_clean or uname_clean == "guest":
        return normalize_roles(token_roles or ["guest"])

    now = time.time()
    cached = _ROLES_CACHE.get(uname_clean)
    if cached and (now - cached[0] < _ROLES_CACHE_TTL):
        return list(cached[1])

    try:
        roles = database.get_user_roles(username, active_only=True)
    except Exception as e:
        logger.warning(f"Gagal mengambil role efektif untuk '{username}' dari DB, fallback ke token: {e}")
        return normalize_roles(token_roles or ["user"])

    roles = normalize_roles(roles)
    _ROLES_CACHE[uname_clean] = (now, roles)
    return roles

# Pemetaan alias dinamis (didukung cache in-memory dan sinkronisasi otomatis dari mcp_resources / live probe)
_SEED_SAP_ALIASES: Dict[str, str] = {
    "dev": "sap:dev-aix",
    "prod": "sap:prod-aix",
    "prd": "sap:prod-aix",
    "qa": "sap:qa",
    "sandbox": "sap:sandbox",
}

_DYNAMIC_SAP_MAP: Dict[str, str] = dict(_SEED_SAP_ALIASES)
_DYNAMIC_SQL_MAP: Dict[str, str] = {}
_DYNAMIC_GENERAL_MAP: Dict[str, str] = {
    "rag": "service:rag",
    "service:rag": "service:rag",
    "email": "service:email",
    "service:email": "service:email",
}
_LAST_ALIAS_MAP_SYNC: float = 0.0
_ALIAS_CACHE_TTL = 60.0


def clear_access_cache():
    """Mengosongkan cache resolusi izin dan cache alias dinamis."""
    global _ACCESS_CACHE, _DYNAMIC_SAP_MAP, _DYNAMIC_SQL_MAP, _LAST_ALIAS_MAP_SYNC
    _ACCESS_CACHE.clear()
    _DYNAMIC_SAP_MAP = dict(_SEED_SAP_ALIASES)
    _DYNAMIC_SQL_MAP.clear()
    _LAST_ALIAS_MAP_SYNC = 0.0


def register_mcp_aliases(can_key: str, name: str, aliases: List[str], sid: str = ""):
    """Mendaftarkan variasi alias server yang dilaporkan oleh server MCP ke peta dinamis."""
    global _DYNAMIC_SAP_MAP, _DYNAMIC_SQL_MAP
    if not can_key:
        return
    prefix = can_key.split(":", 1)[0].lower()
    target_map = _DYNAMIC_SQL_MAP if prefix == "sql" else _DYNAMIC_SAP_MAP

    # 1. Kunci kanonikal
    target_map[can_key.lower().strip()] = can_key
    sub_key = can_key.split(":", 1)[1] if ":" in can_key else can_key
    target_map[sub_key.lower().strip()] = can_key

    # 2. Nama server
    if name:
        n_low = name.lower().strip()
        target_map[n_low] = can_key
        target_map[f"{prefix}:{n_low}"] = can_key
        target_map[n_low.replace("-", " ")] = can_key
        target_map[n_low.replace(" ", "-")] = can_key

    # 3. Seluruh aliases dari server MCP
    for a in (aliases or []):
        if not a:
            continue
        a_low = str(a).lower().strip()
        target_map[a_low] = can_key
        target_map[f"{prefix}:{a_low}"] = can_key
        target_map[a_low.replace("-", " ")] = can_key
        target_map[a_low.replace(" ", "-")] = can_key

    # 4. SID jika SAP
    if sid and prefix == "sap":
        sid_low = str(sid).lower().strip()
        target_map[sid_low] = can_key
        target_map[f"sap:{sid_low}"] = can_key


def load_aliases_from_db(force_refresh: bool = False):
    """Memuat alias dinamis dari ai_assistant.mcp_resources."""
    global _DYNAMIC_SAP_MAP, _DYNAMIC_SQL_MAP, _LAST_ALIAS_MAP_SYNC
    now = time.time()
    if not force_refresh and (_DYNAMIC_SAP_MAP or _DYNAMIC_SQL_MAP) and (now - _LAST_ALIAS_MAP_SYNC < _ALIAS_CACHE_TTL):
        return

    try:
        engine = database.get_engine()
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT resource_key, kind, label, sid FROM ai_assistant.mcp_resources WHERE archived = FALSE")
            ).fetchall()
            for rk, kind, label, sid in rows:
                if not rk:
                    continue
                rk_str = str(rk).strip()
                rk_lower = rk_str.lower()
                sub = rk_lower.split(":", 1)[1] if ":" in rk_lower else rk_lower
                prefix = rk_str.split(":", 1)[0].lower()
                target_map = _DYNAMIC_SQL_MAP if (kind == "sql" or prefix == "sql") else _DYNAMIC_SAP_MAP

                target_map[rk_lower] = rk_str
                target_map[sub] = rk_str

                if label:
                    lbl = str(label).lower().strip()
                    target_map[lbl] = rk_str
                    target_map[f"{prefix}:{lbl}"] = rk_str
                    target_map[lbl.replace("-", " ")] = rk_str
                    target_map[lbl.replace(" ", "-")] = rk_str
                    if "(" in lbl and ")" in lbl:
                        main_part = lbl.split("(")[0].strip()
                        target_map[main_part] = rk_str
                        target_map[f"{prefix}:{main_part}"] = rk_str
                        target_map[main_part.replace(" ", "-")] = rk_str
                        sub_parts = lbl.split("(")[1].split(")")[0].split(",")
                        for p in sub_parts:
                            p_str = p.strip()
                            if p_str:
                                target_map[p_str] = rk_str
                                target_map[f"{prefix}:{p_str}"] = rk_str
                                target_map[p_str.replace(" ", "-")] = rk_str
                                target_map[p_str.replace("-", " ")] = rk_str
                if sid and (kind == "sap" or prefix == "sap"):
                    sid_lower = str(sid).lower().strip()
                    target_map[sid_lower] = rk_str
                    target_map[f"sap:{sid_lower}"] = rk_str
    except Exception as e:
        logger.warning(f"Gagal memuat alias dinamis dari mcp_resources: {e}")

    _LAST_ALIAS_MAP_SYNC = now


def is_access_control_enabled() -> bool:
    """Mengecek apakah master switch penegakan otorisasi MCP sedang aktif."""
    try:
        cfg = database.get_system_config()
        val = cfg.get("mcp_access_control_enabled")
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.strip().lower() in ("true", "1", "yes", "on")
        return False
    except Exception as e:
        logger.warning(f"Gagal memeriksa status mcp_access_control_enabled: {e}")
        return False


def set_access_control_master(enabled: bool, actor: str = "system") -> bool:
    """Mengaktifkan atau menonaktifkan master switch kontrol akses MCP."""
    ok = database.update_system_config(mcp_access_control_enabled=bool(enabled))
    clear_access_cache()
    log_audit(
        actor=actor,
        target_type="system_config",
        target_id="mcp_access_control_enabled",
        action="TOGGLE_MASTER_SWITCH",
        detail=f"Master switch diubah menjadi {'AKTIF' if enabled else 'NONAKTIF'}",
    )
    return ok


def canonical_resource_key(raw: str) -> str:
    """Menghasilkan resource_key standar kanonikal dari target_server/alias secara dinamis."""
    if not raw:
        return "sap:sandbox-new"
    s = raw.strip().lower()

    if s in _DYNAMIC_GENERAL_MAP:
        return _DYNAMIC_GENERAL_MAP[s]
    if s in ("sql", "sql:"):
        return "sql"
    if s in ("sap", "sap:"):
        return "sap"

    load_aliases_from_db()

    # Jika secara eksplisit diawali sql:
    if s.startswith("sql:"):
        sub = s.split(":", 1)[1].strip()
        return _DYNAMIC_SQL_MAP.get(sub, _DYNAMIC_SQL_MAP.get(f"sql:{sub}", f"sql:{sub}"))

    # Jika secara eksplisit diawali sap:
    if s.startswith("sap:"):
        sub = s.split(":", 1)[1].strip()
        return _DYNAMIC_SAP_MAP.get(sub, _DYNAMIC_SAP_MAP.get(f"sap:{sub}", f"sap:{sub}"))

    # Bila tanpa prefix: utamakan SAP untuk nama bersama (seperti 'dev'), lalu periksa SQL
    if s in _DYNAMIC_SAP_MAP:
        return _DYNAMIC_SAP_MAP[s]
    if s in _DYNAMIC_SQL_MAP:
        return _DYNAMIC_SQL_MAP[s]

    return f"sap:{s}"


def sync_resources_from_mcp(status_dict: dict) -> List[str]:
    """Meng-upsert katalog mcp_resources berdasarkan discovery live dari check_servers_status()."""
    if not status_dict:
        return []

    upserted_keys = []
    now = datetime.now(timezone.utc)
    engine = database.get_engine()

    resources_to_sync = []

    # 1. Services
    resources_to_sync.append({
        "key": "service:rag",
        "kind": "service",
        "label": "Manufacturing RAG Knowledge Base",
        "sid": "",
        "client": "",
        "is_production": False,
    })
    resources_to_sync.append({
        "key": "service:email",
        "kind": "service",
        "label": "MCP Email Service",
        "sid": "",
        "client": "",
        "is_production": False,
    })

    # 2. SAP Sub Servers
    sap_subs = status_dict.get("sap", {}).get("sub_servers", [])
    for srv in sap_subs:
        name = srv.get("name", "").strip()
        aliases = [str(a).strip() for a in (srv.get("aliases") or []) if a]
        sid = srv.get("sid", "").strip()

        # Cocokkan ke resource_key yang ada di DB bila sudah pernah terdaftar
        load_aliases_from_db()
        can_key = None
        if name.lower() in _DYNAMIC_SAP_MAP:
            can_key = _DYNAMIC_SAP_MAP[name.lower()]
        if not can_key:
            for a in aliases:
                if a.lower() in _DYNAMIC_SAP_MAP:
                    can_key = _DYNAMIC_SAP_MAP[a.lower()]
                    break
        if not can_key:
            slug = aliases[0].lower() if aliases else name.lower().replace(" ", "-")
            can_key = f"sap:{slug}"

        # Daftarkan seluruh alias secara dinamis
        register_mcp_aliases(can_key, name, aliases, sid)

        is_prod = bool(
            srv.get("production_warning")
            or "prod" in srv.get("environment", "").lower()
            or any(p in name.lower() for p in ["prod", "prd", "prp"])
        )
        resources_to_sync.append({
            "key": can_key,
            "kind": "sap",
            "label": name or can_key,
            "sid": sid,
            "client": str(srv.get("client", "")),
            "is_production": is_prod,
        })

    # 3. SQL Sub Servers
    sql_subs = status_dict.get("sql", {}).get("sub_servers", [])
    for srv in sql_subs:
        name = srv.get("name", "").strip() or "default"
        aliases = [str(a).strip() for a in (srv.get("aliases") or []) if a]
        can_key = f"sql:{name.lower()}"

        # Daftarkan seluruh alias SQL secara dinamis
        register_mcp_aliases(can_key, name, aliases)

        is_prod = bool(
            srv.get("production_warning")
            or "prod" in srv.get("environment", "").lower()
            or any(p in name.lower() for p in ["prod", "prd", "prp"])
        )
        label = name
        if aliases:
            label = f"{name} ({', '.join(aliases[:3])})"

        resources_to_sync.append({
            "key": can_key,
            "kind": "sql",
            "label": label,
            "sid": "",
            "client": "",
            "is_production": is_prod,
        })

    try:
        with engine.begin() as conn:
            for item in resources_to_sync:
                conn.execute(
                    text("""
                    INSERT INTO ai_assistant.mcp_resources
                        (resource_key, kind, label, sid, client, is_production, last_seen_at)
                    VALUES
                        (:k, :kind, :label, :sid, :cli, :prod, :now)
                    ON CONFLICT (resource_key) DO UPDATE SET
                        label = EXCLUDED.label,
                        sid = CASE WHEN EXCLUDED.sid <> '' THEN EXCLUDED.sid ELSE ai_assistant.mcp_resources.sid END,
                        client = CASE WHEN EXCLUDED.client <> '' THEN EXCLUDED.client ELSE ai_assistant.mcp_resources.client END,
                        is_production = EXCLUDED.is_production,
                        last_seen_at = :now,
                        archived = FALSE
                """),
                    {
                        "k": item["key"],
                        "kind": item["kind"],
                        "label": item["label"],
                        "sid": item["sid"],
                        "cli": item["client"],
                        "prod": item["is_production"],
                        "now": now,
                    },
                )
                upserted_keys.append(item["key"])
    except Exception as e:
        logger.error(f"Gagal sinkronisasi mcp_resources dari MCP: {e}")

    return upserted_keys


def get_all_resources(include_archived: bool = False) -> List[Dict[str, Any]]:
    """Mengambil semua daftar resource yang tercatat dalam katalog."""
    engine = database.get_engine()
    query = """
        SELECT resource_key, kind, label, sid, client, is_production, first_seen_at, last_seen_at, archived
        FROM ai_assistant.mcp_resources
    """
    if not include_archived:
        query += " WHERE archived = FALSE"
    query += " ORDER BY kind ASC, is_production ASC, resource_key ASC"

    try:
        with engine.connect() as conn:
            rows = conn.execute(text(query)).fetchall()
            return [
                {
                    "resource_key": r[0],
                    "kind": r[1],
                    "label": r[2],
                    "sid": r[3],
                    "client": r[4],
                    "is_production": bool(r[5]),
                    "first_seen_at": r[6].isoformat() if r[6] else None,
                    "last_seen_at": r[7].isoformat() if r[7] else None,
                    "archived": bool(r[8]),
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Gagal mengambil resource MCP: {e}")
        return []


def resolve_access(username: str, role: Union[str, List[str], None] = "user") -> Dict[str, Dict[str, Any]]:
    """Menyelesaikan hak akses efektif untuk pengguna dan perannya (mendukung multi-role).

    Menggabungkan template Role (prinsip UNION) -> override User (tri-state: Allow/Deny/Inherit).
    Hasil disimpan pada cache memory dengan TTL 30 detik.
    """
    now_ts = time.time()
    roles = normalize_roles(role)
    roles_tuple = tuple(sorted(roles))
    cache_key = (username or "guest", roles_tuple)

    cached = _ACCESS_CACHE.get(cache_key)
    if cached and (now_ts - cached[0] < _CACHE_TTL_SECONDS):
        return cached[1]

    engine = database.get_engine()
    now_dt = datetime.now(timezone.utc)

    # 1. Ambil semua resource aktif
    resources = get_all_resources(include_archived=False)
    resolved: Dict[str, Dict[str, Any]] = {}

    for r in resources:
        k = r["resource_key"]
        resolved[k] = {
            "resource_key": k,
            "kind": r["kind"],
            "label": r["label"],
            "is_production": r["is_production"],
            "allowed": False,
            "can_write": False,
            "source": "deny_default",
            "valid_until": None,
        }

    # Bila salah satu peran adalah superadmin, berikan semua akses secara default (Full Bypass)
    if "superadmin" in roles:
        for k in resolved:
            resolved[k]["allowed"] = True
            resolved[k]["can_write"] = True
            resolved[k]["source"] = "superadmin"
        _ACCESS_CACHE[cache_key] = (now_ts, resolved)
        return resolved

    try:
        with engine.connect() as conn:
            # 2. Ambil izin level Role untuk seluruh peran yang dimiliki (Union / Paling Permisif)
            # SQLAlchemy secara otomatis akan melakukan ekspansi parameter untuk list bila menggunakan tuple() 
            # bersama statement IN (misal IN :roles tidak selalu aman di DB tertentu tanpa bindparam, tapi kita pakai list comprehension / tuple).
            # Pendekatan psycopg3 yang paling portabel untuk IN clause manual:
            roles_tuple = tuple(roles)
            r_rows = conn.execute(
                text("""
                SELECT rra.resource_key, rra.allowed, rra.can_write
                FROM ai_assistant.role_resource_access rra
                JOIN ai_assistant.roles r ON LOWER(r.code) = LOWER(rra.role)
                WHERE LOWER(rra.role) = ANY(:roles) AND r.enabled = TRUE
            """),
                {"roles": list(roles_tuple), "role": roles_tuple[0] if roles_tuple else "user"},
            ).fetchall()

            for rk, allowed, can_write in r_rows:
                if rk in resolved:
                    if allowed:
                        resolved[rk]["allowed"] = True
                        resolved[rk]["source"] = "role"
                    if can_write:
                        resolved[rk]["can_write"] = True

            # 3. Ambil override izin level User (bila ada username)
            if username and username.lower() != "guest":
                u_rows = conn.execute(
                    text("""
                    SELECT resource_key, allowed, can_write, valid_until
                    FROM ai_assistant.user_resource_access
                    WHERE LOWER(username) = LOWER(:u)
                """),
                    {"u": username},
                ).fetchall()

                for rk, allowed, can_write, valid_until in u_rows:
                    if rk in resolved:
                        # Cek apakah kedaluwarsa
                        if valid_until and valid_until < now_dt:
                            continue  # Override kedaluwarsa, abaikan
                        resolved[rk]["allowed"] = bool(allowed)
                        resolved[rk]["can_write"] = bool(can_write)
                        resolved[rk]["source"] = "user_override"
                        resolved[rk]["valid_until"] = valid_until.isoformat() if valid_until else None

    except Exception as e:
        logger.error(f"Gagal melakukan resolusi akses untuk ({username}, {roles}): {e}")

    _ACCESS_CACHE[cache_key] = (now_ts, resolved)
    return resolved


def assert_can_use(username: str, role: Union[str, List[str], None], active_server: str, need_write: bool = False):
    """Memvalidasi apakah pengguna memiliki hak akses ke resource target yang dipilih.

    Melemparkan HTTPException 403 bila dilarang.
    Bila master switch kontrol akses OFF, langsung lewat (no-op).
    """
    if not is_access_control_enabled():
        return  # Master switch OFF: tidak ada pembatasan

    roles = normalize_roles(role)
    if "superadmin" in roles:
        return  # Superadmin selalu berhak

    user_access = resolve_access(username, roles)

    # Bila active_server adalah kategori umum ("sap" atau "sql")
    raw_lower = (active_server or "").strip().lower()
    if raw_lower in ("sap", "sap:"):
        has_any_sap = any(rk.startswith("sap:") and perm.get("allowed") for rk, perm in user_access.items())
        if not has_any_sap:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: Peran akun Anda tidak memiliki izin untuk mengakses server SAP apa pun.",
            )
        return

    if raw_lower in ("sql", "sql:"):
        has_any_sql = any(rk.startswith("sql:") and perm.get("allowed") for rk, perm in user_access.items())
        if not has_any_sql:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: Peran akun Anda tidak memiliki izin untuk mengakses server SQL apa pun.",
            )
        return

    can_key = canonical_resource_key(active_server)

    perm = user_access.get(can_key)
    if not perm or not perm.get("allowed"):
        logger.warning(
            f"AKSES DITOLAK: user='{username}' roles='{roles}' mencoba mengakses '{active_server}' (key: '{can_key}') tanpa izin."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Akses ditolak: Anda tidak memiliki izin untuk terhubung atau menggunakan "
                f"sumber daya '{active_server}' ({perm.get('label', can_key) if perm else can_key}). "
                "Silakan hubungi administrator bila Anda memerlukan akses ke server ini."
            ),
        )

    if need_write and not perm.get("can_write"):
        logger.warning(
            f"AKSES TULIS DITOLAK: user='{username}' roles='{roles}' mencoba memodifikasi '{active_server}' (key: '{can_key}') tanpa hak write."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Operasi ditolak: Anda hanya memiliki izin baca (read-only) pada sistem '{active_server}'. "
                "Perubahan/pembuatan data pada server ini tidak diizinkan."
            ),
        )


def allowed_connectors(username: str, role: Union[str, List[str], None]) -> Set[str]:
    """Mengembalikan daftar konektor utama ('sap', 'sql', 'rag', 'email') yang boleh diakses."""
    if not is_access_control_enabled():
        return {"sap", "sql", "rag", "email"}

    roles = normalize_roles(role)
    if "superadmin" in roles:
        return {"sap", "sql", "rag", "email"}

    access = resolve_access(username, roles)
    connectors = set()

    for rk, perm in access.items():
        if not perm.get("allowed"):
            continue
        if rk.startswith("sap:"):
            connectors.add("sap")
        elif rk.startswith("sql:"):
            connectors.add("sql")
        elif rk == "service:rag":
            connectors.add("rag")
        elif rk == "service:email":
            connectors.add("email")

    return connectors


def filter_servers_for_user(status_dict: dict, username: str, role: Union[str, List[str], None] = "user") -> dict:
    """Memfilter sub-servers SAP dan SQL dalam status response agar hanya menampilkan server yang diizinkan."""
    if not is_access_control_enabled():
        return status_dict

    roles = normalize_roles(role)
    if "superadmin" in roles:
        return status_dict

    res = copy.deepcopy(status_dict)
    access = resolve_access(username, roles)

    # Filter SAP sub servers
    if "sap" in res and "sub_servers" in res["sap"]:
        filtered_sap = []
        for srv in res["sap"]["sub_servers"]:
            alias = srv.get("alias") or (srv.get("aliases") or [""])[0] or srv.get("name", "").lower()
            can_key = canonical_resource_key(f"sap:{alias}")
            perm = access.get(can_key)
            if perm and perm.get("allowed"):
                # Sematkan juga flag can_write untuk kenyamanan UI
                srv["can_write"] = perm.get("can_write", False)
                filtered_sap.append(srv)
        res["sap"]["sub_servers"] = filtered_sap
        if not filtered_sap:
            res["sap"]["online"] = False
            res["sap"]["active_server"] = "Tidak ada server yang diizinkan"

    # Filter SQL sub servers
    if "sql" in res and "sub_servers" in res["sql"]:
        filtered_sql = []
        for srv in res["sql"]["sub_servers"]:
            name = srv.get("name") or "default"
            can_key = f"sql:{name}"
            perm = access.get(can_key)
            if perm and perm.get("allowed"):
                srv["can_write"] = perm.get("can_write", False)
                filtered_sql.append(srv)
        res["sql"]["sub_servers"] = filtered_sql
        if not filtered_sql:
            res["sql"]["online"] = False
            res["sql"]["active_server"] = "Tidak ada database yang diizinkan"

    # Filter Services (RAG Knowledge Base & Email)
    if "rag" in res:
        rag_perm = access.get("service:rag")
        res["rag"]["allowed"] = bool(rag_perm and rag_perm.get("allowed"))
    if "email" in res:
        email_perm = access.get("service:email")
        res["email"]["allowed"] = bool(email_perm and email_perm.get("allowed"))

    return res


# ----------------------------------------------------------------------
# OPERASI ADMIN & AUDIT
# ----------------------------------------------------------------------


def log_audit(
    actor: str,
    target_type: str,
    target_id: str,
    action: str,
    resource_key: Optional[str] = None,
    detail: str = "",
):
    """Mencatat log audit perubahan otorisasi ke ai_assistant.access_audit."""
    engine = database.get_engine()
    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                INSERT INTO ai_assistant.access_audit
                    (actor, target_type, target_id, resource_key, action, detail, created_at)
                VALUES
                    (:actor, :tt, :tid, :rk, :act, :det, :now)
            """),
                {
                    "actor": actor or "system",
                    "tt": target_type,
                    "tid": target_id,
                    "rk": resource_key or "",
                    "act": action,
                    "det": detail,
                    "now": datetime.now(timezone.utc),
                },
            )
    except Exception as e:
        logger.error(f"Gagal mencatat audit access control: {e}")


def get_audit_logs(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Mengambil riwayat log audit akses MCP."""
    engine = database.get_engine()
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                SELECT id, actor, target_type, target_id, resource_key, action, detail, created_at
                FROM ai_assistant.access_audit
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """),
                {"limit": max(1, min(limit, 500)), "offset": max(0, offset)},
            ).fetchall()

            return [
                {
                    "id": r[0],
                    "actor": r[1],
                    "target_type": r[2],
                    "target_id": r[3],
                    "resource_key": r[4],
                    "action": r[5],
                    "detail": r[6],
                    "created_at": r[7].isoformat() if r[7] else None,
                }
                for r in rows
            ]
    except Exception as e:
        logger.error(f"Gagal mengambil log audit: {e}")
        return []


def get_all_roles_matrix() -> Dict[str, Any]:
    """Mengambil matriks izin Role x Resource lengkap."""
    resources = get_all_resources(include_archived=False)
    engine = database.get_engine()
    
    # Fallback hardcode hanya dipakai saat query BENAR-BENAR gagal (exception),
    # bukan saat tabel roles memang kosong secara sah - kondisi kosong yang sah
    # harus tampil apa adanya di matriks, bukan diganti diam-diam dengan 9 role
    # hantu yang mungkin sudah tidak ada di database.
    try:
        role_meta = database.get_roles(enabled_only=False)
        known_roles = [r["code"] for r in role_meta]
    except Exception as e:
        logger.warning(f"Fallback get_roles in get_all_roles_matrix: {e}")
        role_meta = []
        known_roles = [
            "superadmin",
            "abaper",
            "functional",
            "backend",
            "frontend",
            "basis",
            "data_analyst",
            "user",
            "guest",
        ]

    matrix: Dict[str, Dict[str, Dict[str, bool]]] = {
        r: {
            res["resource_key"]: {
                "allowed": (r == "superadmin"),
                "can_write": (r == "superadmin"),
            }
            for res in resources
        }
        for r in known_roles
    }

    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                SELECT role, resource_key, allowed, can_write
                FROM ai_assistant.role_resource_access
            """)
            ).fetchall()

            for role, rk, allowed, can_write in rows:
                role_l = role.lower()
                if role_l not in matrix:
                    matrix[role_l] = {
                        res["resource_key"]: {"allowed": False, "can_write": False}
                        for res in resources
                    }
                    if role_l not in known_roles:
                        known_roles.append(role_l)
                if rk in matrix[role_l]:
                    matrix[role_l][rk]["allowed"] = bool(allowed)
                    matrix[role_l][rk]["can_write"] = bool(can_write)
    except Exception as e:
        logger.error(f"Gagal mengambil matriks role access: {e}")

    return {
        "resources": resources,
        "roles": known_roles,
        "role_meta": role_meta,
        "matrix": matrix,
        "master_enabled": is_access_control_enabled(),
    }


def update_role_access(role: str, items: List[Dict[str, Any]], actor: str) -> bool:
    """Memperbarui set izin untuk peran tertentu."""
    role_l = role.lower()
    if role_l == "superadmin":
        return True  # Superadmin tidak dapat dibatasi

    engine = database.get_engine()
    now = datetime.now(timezone.utc)

    try:
        with engine.begin() as conn:
            for it in items:
                rk = it["resource_key"]
                allowed = bool(it.get("allowed", False))
                can_write = bool(it.get("can_write", False))

                conn.execute(
                    text("""
                    INSERT INTO ai_assistant.role_resource_access
                        (role, resource_key, allowed, can_write, updated_at)
                    VALUES
                        (:role, :rk, :allowed, :cw, :now)
                    ON CONFLICT (role, resource_key) DO UPDATE SET
                        allowed = EXCLUDED.allowed,
                        can_write = EXCLUDED.can_write,
                        updated_at = :now
                """),
                    {"role": role_l, "rk": rk, "allowed": allowed, "cw": can_write, "now": now},
                )

        clear_access_cache()
        log_audit(
            actor=actor,
            target_type="role",
            target_id=role_l,
            action="UPDATE_ROLE_ACCESS",
            detail=f"Diperbarui {len(items)} izin resource untuk role '{role_l}'",
        )
        return True
    except Exception as e:
        logger.error(f"Gagal memperbarui izin role '{role}': {e}")
        return False


def get_user_matrix(username: str) -> Dict[str, Any]:
    """Mengambil izin spesifik pengguna beserta status pewarisan rolenya."""
    engine = database.get_engine()
    resources = get_all_resources(include_archived=False)

    user_data = database.get_user_by_username(username)
    if not user_data:
        raise HTTPException(status_code=404, detail=f"Pengguna '{username}' tidak ditemukan.")

    user_roles = user_data.get("roles") or [user_data.get("role", "user")]
    role = user_data.get("role", "user")
    resolved = resolve_access(username, user_roles)

    # Ambil data mentah override dari user_resource_access
    overrides: Dict[str, Dict[str, Any]] = {}
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                SELECT resource_key, allowed, can_write, valid_until, granted_by, updated_at
                FROM ai_assistant.user_resource_access
                WHERE LOWER(username) = LOWER(:u)
            """),
                {"u": username},
            ).fetchall()

            for rk, allowed, can_write, vu, gb, up in rows:
                overrides[rk] = {
                    "resource_key": rk,
                    "allowed": bool(allowed),
                    "can_write": bool(can_write),
                    "valid_until": vu.isoformat() if vu else None,
                    "granted_by": gb,
                    "updated_at": up.isoformat() if up else None,
                }
    except Exception as e:
        logger.error(f"Gagal mengambil override user '{username}': {e}")

    items = []
    for r in resources:
        rk = r["resource_key"]
        eff = resolved.get(rk, {})
        ovr = overrides.get(rk)

        state = "inherit"
        if ovr:
            state = "allow" if ovr["allowed"] else "deny"

        items.append({
            "resource_key": rk,
            "kind": r["kind"],
            "label": r["label"],
            "is_production": r["is_production"],
            "state": state,  # "inherit" | "allow" | "deny"
            "can_write": ovr["can_write"] if ovr else eff.get("can_write", False),
            "effective_allowed": eff.get("allowed", False),
            "effective_can_write": eff.get("can_write", False),
            "source": eff.get("source", "deny_default"),
            "valid_until": ovr["valid_until"] if ovr else None,
        })

    return {
        "username": username,
        "role": role,
        "roles": user_roles,
        "resources": items,
        "master_enabled": is_access_control_enabled(),
    }


def update_user_access(username: str, items: List[Dict[str, Any]], actor: str) -> bool:
    """Memperbarui override izin pengguna (tri-state: inherit, allow, deny)."""
    user_data = database.get_user_by_username(username)
    if not user_data:
        raise HTTPException(status_code=404, detail=f"Pengguna '{username}' tidak ditemukan.")

    engine = database.get_engine()
    now = datetime.now(timezone.utc)

    try:
        with engine.begin() as conn:
            for it in items:
                rk = it["resource_key"]
                state = it.get("state", "inherit").lower()
                can_write = bool(it.get("can_write", False))
                vu = it.get("valid_until")
                vu_dt = None
                if vu:
                    try:
                        vu_dt = datetime.fromisoformat(vu.replace("Z", "+00:00"))
                    except Exception:
                        pass

                if state == "inherit":
                    # Hapus baris override agar kembali mewarisi role
                    conn.execute(
                        text("""
                        DELETE FROM ai_assistant.user_resource_access
                        WHERE LOWER(username) = LOWER(:u) AND resource_key = :rk
                    """),
                        {"u": username, "rk": rk},
                    )
                else:
                    is_allowed = (state == "allow")
                    conn.execute(
                        text("""
                        INSERT INTO ai_assistant.user_resource_access
                            (username, resource_key, allowed, can_write, valid_until, granted_by, updated_at)
                        VALUES
                            (:u, :rk, :allowed, :cw, :vu, :actor, :now)
                        ON CONFLICT (username, resource_key) DO UPDATE SET
                            allowed = EXCLUDED.allowed,
                            can_write = EXCLUDED.can_write,
                            valid_until = EXCLUDED.valid_until,
                            granted_by = EXCLUDED.granted_by,
                            updated_at = :now
                    """),
                        {
                            "u": username,
                            "rk": rk,
                            "allowed": is_allowed,
                            "cw": can_write,
                            "vu": vu_dt,
                            "actor": actor,
                            "now": now,
                        },
                    )

        clear_access_cache()
        log_audit(
            actor=actor,
            target_type="user",
            target_id=username,
            action="UPDATE_USER_ACCESS",
            detail=f"Diperbarui {len(items)} override izin resource untuk user '{username}'",
        )
        return True
    except Exception as e:
        logger.error(f"Gagal memperbarui izin user '{username}': {e}")
        return False


def bulk_update_user_access(
    usernames: List[str],
    resource_key: str,
    state: str,  # "inherit", "allow", "deny"
    can_write: bool,
    valid_until: Optional[str],
    actor: str,
) -> int:
    """Mengubah izin satu resource secara massal (bulk) untuk banyak pengguna sekaligus."""
    if not usernames or not resource_key:
        return 0

    state_l = (state or "inherit").lower()
    engine = database.get_engine()
    now = datetime.now(timezone.utc)
    vu_dt = None
    if valid_until:
        try:
            vu_dt = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
        except Exception:
            pass

    count = 0
    try:
        with engine.begin() as conn:
            for u in usernames:
                if state_l == "inherit":
                    conn.execute(
                        text("""
                        DELETE FROM ai_assistant.user_resource_access
                        WHERE LOWER(username) = LOWER(:u) AND resource_key = :rk
                    """),
                        {"u": u, "rk": resource_key},
                    )
                else:
                    is_allowed = (state_l == "allow")
                    conn.execute(
                        text("""
                        INSERT INTO ai_assistant.user_resource_access
                            (username, resource_key, allowed, can_write, valid_until, granted_by, updated_at)
                        VALUES
                            (:u, :rk, :allowed, :cw, :vu, :actor, :now)
                        ON CONFLICT (username, resource_key) DO UPDATE SET
                            allowed = EXCLUDED.allowed,
                            can_write = EXCLUDED.can_write,
                            valid_until = EXCLUDED.valid_until,
                            granted_by = EXCLUDED.granted_by,
                            updated_at = :now
                    """),
                        {
                            "u": u,
                            "rk": resource_key,
                            "allowed": is_allowed,
                            "cw": can_write,
                            "vu": vu_dt,
                            "actor": actor,
                            "now": now,
                        },
                    )
                count += 1

        clear_access_cache()
        log_audit(
            actor=actor,
            target_type="bulk_user",
            target_id=f"{count}_users",
            resource_key=resource_key,
            action="BULK_UPDATE_USER_ACCESS",
            detail=f"Set state='{state_l}', can_write={can_write} untuk {count} pengguna pada resource '{resource_key}'",
        )
        return count
    except Exception as e:
        logger.error(f"Gagal melakukan bulk update access: {e}")
        return 0
