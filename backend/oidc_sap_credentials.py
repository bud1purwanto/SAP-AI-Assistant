"""Personal SAP credentials owned by Dashboard OIDC."""

from urllib.parse import quote

import httpx
from fastapi import HTTPException

from config import settings
from mcp_registry import mcp_control_plane_base


def _token(user: dict) -> str:
    token = (user or {}).get("dashboard_token") or (user or {}).get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Sesi OIDC perlu diperbarui. Silakan login kembali.")
    return token


def _rows(payload) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("connections", "credentials", "systems", "targets", "items", "results", "data"):
            value = payload.get(key)
            if isinstance(value, (list, dict)):
                return _rows(value)
    raise HTTPException(status_code=502, detail="Format daftar kredensial SAP OIDC tidak dikenal.")


def _connection_id(row: dict) -> str:
    connection = row.get("connection") if isinstance(row.get("connection"), dict) else {}
    return str(row.get("connectionId") or row.get("connection_id") or connection.get("id") or "").strip()


def _target_names(row: dict) -> set[str]:
    keys = ("target", "alias", "name", "connectionName", "connection_name", "accessName", "resourceKey", "resource_key")
    connection = row.get("connection") if isinstance(row.get("connection"), dict) else {}
    names = {str(source[key]).strip().lower() for source in (row, connection) for key in keys if source.get(key)}
    aliases = row.get("aliases") or connection.get("aliases") or []
    if isinstance(aliases, list):
        names.update(str(alias).strip().lower() for alias in aliases if alias)
    names.update(name.split(":", 1)[1] for name in tuple(names) if name.startswith("sap:"))
    return names


def resolve_connection_id(rows: list[dict], target: str, explicit_id: str = "") -> str:
    wanted = str(target or "").strip().lower()
    if explicit_id:
        connection_id = str(explicit_id).strip()
        if any(_connection_id(row) == connection_id and wanted in _target_names(row) for row in rows):
            return connection_id
    for row in rows:
        if wanted == _connection_id(row).lower() or wanted in _target_names(row):
            connection_id = _connection_id(row)
            if connection_id:
                return connection_id
    raise HTTPException(status_code=404, detail="Target SAP tidak ditemukan di Dashboard OIDC.")


def saved_credentials(rows: list[dict]) -> list[dict]:
    saved = []
    for row in rows:
        credential = row.get("credential") if isinstance(row.get("credential"), dict) else {}
        configured = next((row[key] for key in ("hasCredential", "hasCredentials", "has_credential",
                                                    "hasPersonalCredential", "credentialConfigured",
                                                    "configured", "isConfigured") if key in row), None)
        username = (row.get("username") or row.get("sapUser") or row.get("sap_user") or row.get("sapUsername")
                    or credential.get("username") or credential.get("sapUser") or "")
        if configured is False or (configured is None and not username and not credential
                                   and not row.get("credentialId") and not row.get("credential_id")):
            continue
        connection = row.get("connection") if isinstance(row.get("connection"), dict) else {}
        names = _target_names(row)
        raw_target = row.get("target")
        if str(raw_target or "").lower() == _connection_id(row).lower():
            raw_target = None
        target = (raw_target or row.get("alias") or row.get("resourceKey") or row.get("resource_key")
                  or connection.get("resourceKey") or connection.get("resource_key")
                  or row.get("connectionName") or row.get("accessName") or row.get("name") or connection.get("name"))
        if not target and names:
            target = sorted(names)[0]
        if not target:
            target = _connection_id(row)
        if not target or not _connection_id(row):
            continue
        saved.append({
            "target": str(target).removeprefix("sap:"),
            "connection_id": _connection_id(row),
            "display_name": row.get("displayName") or row.get("connectionName") or row.get("accessName") or connection.get("name") or "",
            "sap_user": str(username),
            "updated_at": row.get("updatedAt") or row.get("updated_at"),
        })
    return saved


async def _request(method: str, path: str, user: dict, body: dict | None = None):
    url = mcp_control_plane_base("sap") + path
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.request(method, url, json=body,
                                            headers={"Authorization": f"Bearer {_token(user)}"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Layanan kredensial SAP OIDC tidak merespons.") from exc
    if response.status_code in (401, 403):
        raise HTTPException(status_code=response.status_code, detail="Akses kredensial SAP ditolak OIDC.")
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Target atau kredensial SAP tidak ditemukan di OIDC.")
    if not response.is_success:
        raise HTTPException(status_code=502, detail=f"Layanan kredensial SAP OIDC gagal (HTTP {response.status_code}).")
    if response.status_code == 204 or not response.content:
        return None
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respons kredensial SAP OIDC tidak valid.") from exc


async def list_status(user: dict) -> list[dict]:
    rows = _rows(await _request("GET", "/v1/mcp/sap-credentials/mine", user))
    if not any(_connection_id(row) and _target_names(row) <= {_connection_id(row).lower()} for row in rows):
        return rows
    try:
        targets = _rows(await _request("GET", "/v1/access-requests/available", user))
    except HTTPException:
        return rows
    by_id = {_connection_id(target): target for target in targets if _connection_id(target)}
    enriched = []
    for row in rows:
        target = by_id.get(_connection_id(row), {})
        if not target:
            enriched.append(row)
            continue
        item = dict(row)
        if not item.get("resourceKey") and not item.get("resource_key"):
            item["resourceKey"] = target.get("resourceKey") or target.get("resource_key")
        if not item.get("accessName"):
            item["accessName"] = target.get("name") or target.get("label")
        if not item.get("aliases"):
            item["aliases"] = target.get("aliases") or []
        enriched.append(item)
    return enriched


async def list_sap_resources() -> list[dict]:
    """Ambil target SAP dari katalog OIDC, tanpa fallback target lokal."""
    token = (settings.dashboard_mcp_api_token or "").strip()
    if not token:
        raise HTTPException(status_code=502, detail="Token layanan katalog MCP OIDC belum dikonfigurasi.")
    url = mcp_control_plane_base("sap") + "/v1/integration/resources"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Katalog target SAP OIDC tidak merespons.") from exc
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Katalog target SAP OIDC gagal (HTTP {response.status_code}).")
    try:
        resources = response.json().get("resources")
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=502, detail="Respons katalog target SAP OIDC tidak valid.") from exc
    if not isinstance(resources, list):
        raise HTTPException(status_code=502, detail="Daftar target SAP OIDC tidak tersedia.")
    return [item for item in resources if isinstance(item, dict) and item.get("kind") == "sap"]


async def save(user: dict, connection_id: str, username: str, password: str | None):
    payload = {"username": username}
    if password:
        payload["password"] = password
    return await _request("PUT", f"/v1/mcp/sap-credentials/{quote(connection_id, safe='')}", user, payload)


async def delete(user: dict, connection_id: str):
    return await _request("DELETE", f"/v1/mcp/sap-credentials/{quote(connection_id, safe='')}", user)
