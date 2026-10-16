"""Read-only directory from Dashboard OIDC for the admin UI."""
import logging
from typing import Any

import httpx
from fastapi import HTTPException

from config import settings

logger = logging.getLogger(__name__)


DIRECTORY_PATHS = {
    "users": "/v1/users",
    "roles": "/v1/roles",
    "divisions": "/v1/divisions",
    "departments": "/v1/departments",
}


def _items(payload: Any, kind: str) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in (kind, "items", "results", "content", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                nested = _items(value, kind)
                if nested:
                    return nested
    return []


def _first(value: Any) -> dict:
    if isinstance(value, list):
        return next((item for item in value if isinstance(item, dict)), {})
    return value if isinstance(value, dict) else {}


def _role_codes(user: dict) -> list[str]:
    raw = user.get("roles") or user.get("rawRole") or user.get("role") or []
    if isinstance(raw, (str, dict)):
        raw = [raw]
    return [str(item.get("code") or item.get("name") or item.get("key") if isinstance(item, dict) else item).strip().lower()
            for item in raw if item]


def normalize_directory(kind: str, payload: Any) -> list[dict]:
    rows = _items(payload, kind)
    if kind == "users":
        result = []
        for row in rows:
            division = _first(row.get("divisions") or row.get("division"))
            position = _first(row.get("positions") or row.get("position"))
            roles = _role_codes(row)
            result.append({
                "id": row.get("id"),
                "username": row.get("username") or row.get("userName") or "",
                "full_name": row.get("displayName") or row.get("display_name") or row.get("fullName") or row.get("name") or "",
                "role": roles[0] if roles else "",
                "roles": roles,
                "division_code": division.get("code") or division.get("name") or "",
                "division_name": division.get("name") or "",
                "department_code": _first(row.get("departments") or row.get("department")).get("code") or "",
                "department_name": _first(row.get("departments") or row.get("department")).get("name") or "",
                "position_code": position.get("code") or position.get("name") or "",
                "position_name": position.get("name") or "",
                "job_level": str(position.get("jobLevel") or "").lower(),
                "enabled": row.get("isActive", row.get("enabled")),
            })
        return result
    if kind == "roles":
        return [{
            "code": str(row.get("code") or row.get("key") or row.get("name") or "").lower(),
            "label": row.get("label") or row.get("displayName") or row.get("name") or "",
            "description": row.get("description") or "",
            "enabled": row.get("isActive", row.get("enabled")),
        } for row in rows]
    if kind in ("divisions", "departments"):
        return [{
            "code": str(row.get("code") or row.get("key") or row.get("id") or ""),
            "name": row.get("name") or row.get("displayName") or "",
            "description": row.get("description") or "",
            "enabled": row.get("isActive", row.get("enabled")),
            "department_id": row.get("departmentId") or row.get("department_id"),
        } for row in rows]
    return rows


async def fetch_directory(kind: str, token: str | None, session_id: str | None = None) -> list[dict]:
    """Ambil data direktori murni dari OIDC tanpa fallback lokal."""
    if kind not in DIRECTORY_PATHS:
        raise ValueError(f"Unknown OIDC directory: {kind}")

    active_session_id = session_id
    if not active_session_id:
        try:
            from auth import get_dashboard_session_id
            active_session_id = get_dashboard_session_id()
        except Exception:
            pass

    current_token = token
    if not current_token and active_session_id:
        try:
            from auth import _resolve_dashboard_token
            current_token = _resolve_dashboard_token(active_session_id)
        except Exception:
            pass

    if not current_token:
        logger.warning("Token OIDC kosong saat fetch directory '%s'. Tidak ada fallback lokal.", kind)
        return []

    url = settings.dashboard_oidc_issuer.rstrip("/") + DIRECTORY_PATHS[kind]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers={"Authorization": f"Bearer {current_token}"})

            # Jika 401 dan session_id tersedia, coba refresh token lalu retry 1x
            if response.status_code == 401 and active_session_id:
                logger.info("Directory OIDC 401 Unauthorized untuk '%s'. Mencoba auto-refresh sesi %s...", kind, active_session_id[:8])
                try:
                    from database import get_dashboard_session_data
                    sess_data = get_dashboard_session_data(active_session_id)
                    ref_tok = sess_data.get("refresh_token") if sess_data else None
                    if ref_tok:
                        from auth import _try_refresh_dashboard_token
                        new_token = _try_refresh_dashboard_token(active_session_id, ref_tok)
                        if new_token:
                            response = await client.get(url, headers={"Authorization": f"Bearer {new_token}"})
                except Exception as ref_exc:
                    logger.warning("Auto-refresh pada fetch_directory gagal: %s", ref_exc)

    except httpx.HTTPError as exc:
        logger.error("Directory OIDC tidak merespons (%s): %s", kind, exc)
        raise HTTPException(status_code=502, detail="Directory OIDC tidak merespons.")

    if response.status_code == 401:
        logger.warning("Directory OIDC 401 Unauthorized untuk '%s'. Sesi OIDC kedaluwarsa.", kind)
        return []
    if response.status_code == 403:
        raise HTTPException(status_code=403, detail="Akun ini tidak diizinkan membaca directory OIDC.")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Directory OIDC gagal (HTTP {response.status_code}).")
    return normalize_directory(kind, response.json())
