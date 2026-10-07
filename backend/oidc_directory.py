"""Read-only directory from Dashboard OIDC for the admin UI."""
from typing import Any

import httpx
from fastapi import HTTPException

from config import settings


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


async def fetch_directory(kind: str, token: str | None) -> list[dict]:
    """Fetch a directory using the signed-in user's OIDC token only."""
    if kind not in DIRECTORY_PATHS:
        raise ValueError(f"Unknown OIDC directory: {kind}")
    if not token:
        raise HTTPException(status_code=401, detail="Sesi OIDC perlu diperbarui. Silakan login kembali.")
    url = settings.dashboard_oidc_issuer.rstrip("/") + DIRECTORY_PATHS[kind]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Directory OIDC tidak merespons.") from exc
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Sesi OIDC kedaluwarsa. Silakan login kembali.")
    if response.status_code == 403:
        raise HTTPException(status_code=403, detail="Akun ini tidak diizinkan membaca directory OIDC.")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Directory OIDC gagal (HTTP {response.status_code}).")
    return normalize_directory(kind, response.json())
