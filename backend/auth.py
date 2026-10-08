"""Autentikasi SAP AI Assistant.

Mendukung signed session cookie dan dependensi otorisasi FastAPI
berbasis identitas dari dashboard-mcp.
"""
import contextvars
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status

import bcrypt
from config import settings

logger = logging.getLogger(__name__)

GUEST_USERNAME = "Guest"
GUEST_ROLE = "guest"

_dashboard_tokens: dict[str, tuple[str, datetime]] = {}
_dashboard_access_token: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("dashboard_access_token", default=None)


# --- Password Hashing (bcrypt) ---

def hash_password(password: str) -> str:
    """Hash password menggunakan bcrypt."""
    pwd = (password or "").encode("utf-8")
    return bcrypt.hashpw(pwd[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verifikasi kecocokan password terhadap hash bcrypt."""
    if not password or not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False

# --- Signed Session Cookie ---

def set_dashboard_access_token(token: Optional[str]) -> None:
    _dashboard_access_token.set(token.strip() if isinstance(token, str) and token.strip() else None)


def get_dashboard_access_token() -> Optional[str]:
    return _dashboard_access_token.get()


def create_session_cookie(principal: dict) -> str:
    """Tandatangani payload sesi menggunakan secret server."""
    now = datetime.now(timezone.utc)
    roles = principal.get("roles") or []
    if not principal.get("sub") or not principal.get("username") or not roles:
        raise ValueError("Identitas OIDC tidak lengkap; sesi tidak dapat dibuat.")
    primary_role = principal.get("role") or roles[0]
    expire_hours = getattr(settings, "session_expire_hours", 24) or 24
    default_expire_seconds = int(expire_hours * 3600)
    requested_expire_seconds = principal.get("session_expire_seconds")
    try:
        expire_seconds = int(requested_expire_seconds) if requested_expire_seconds is not None else default_expire_seconds
    except (TypeError, ValueError):
        expire_seconds = default_expire_seconds
    # Batasi masa berlaku cookie sesuai konfigurasi sesi aplikasi.
    # Nilai minimum satu detik mencegah JWT tanpa masa berlaku.
    expire_seconds = min(max(expire_seconds, 1), default_expire_seconds)

    payload: Dict[str, Any] = {
        "sub": str(principal["sub"]),
        "username": str(principal["username"]),
        "role": primary_role,
        "roles": roles,
        "org_units": principal.get("org_units") or [],
        "is_guest": bool(principal.get("is_guest", False)),
        "iat": now,
        "exp": now + timedelta(seconds=expire_seconds),
    }
    for k, v in principal.items():
        if k not in payload and k not in ("access_token", "refresh_token"):
            payload[k] = v

    access_token = principal.get("access_token")
    if access_token:
        session_id = str(principal.get("session_id") or secrets.token_urlsafe(32))
        refresh_token = principal.get("refresh_token")
        oidc_exp_sec = int(principal.get("oidc_expires_in") or 900)
        oidc_exp = now + timedelta(seconds=oidc_exp_sec)
        from database import save_dashboard_session_token
        if not save_dashboard_session_token(session_id, str(access_token), refresh_token=refresh_token, expires_at=oidc_exp):
            raise RuntimeError("Token OIDC gagal disimpan pada sesi login.")
        _dashboard_tokens[session_id] = (str(access_token), oidc_exp, refresh_token)
        payload["session_id"] = session_id

    return jwt.encode(payload, settings.session_secret, algorithm="HS256")


def _try_refresh_dashboard_token(session_id: str, refresh_token: str) -> Optional[str]:
    """Coba perbarui token akses OIDC menggunakan refresh token via Central Dashboard."""
    if not refresh_token:
        return None
    base = settings.dashboard_oidc_issuer.rstrip("/")
    try:
        import httpx
        with httpx.Client(timeout=5.0) as client:
            res = client.post(f"{base}/v1/auth/refresh", cookies={"refresh_token": refresh_token})
            if res.status_code == 200:
                data = res.json()
                new_access = data.get("accessToken")
                new_refresh = res.cookies.get("refresh_token") or refresh_token
                expires_in = int(data.get("expiresIn") or 900)
                now = datetime.now(timezone.utc)
                new_exp = now + timedelta(seconds=expires_in)
                _dashboard_tokens[session_id] = (new_access, new_exp, new_refresh)
                from database import save_dashboard_session_token
                save_dashboard_session_token(session_id, new_access, refresh_token=new_refresh, expires_at=new_exp)
                logger.info(f"OIDC access token diperbarui otomatis untuk sesi {session_id[:8]}...")
                return new_access
            else:
                logger.warning(f"OIDC auto-refresh gagal ({res.status_code}): {res.text[:150]}")
    except Exception as exc:
        logger.warning(f"OIDC auto-refresh error: {exc}")
    return None


def _resolve_dashboard_token(session_id: Optional[str]) -> Optional[str]:
    """Selesaikan token akses OIDC aktif, melakukan auto-refresh jika hampir kedaluwarsa."""
    if not isinstance(session_id, str) or not session_id:
        return None
    now = datetime.now(timezone.utc)
    entry = _dashboard_tokens.get(session_id)
    if entry:
        token = entry[0]
        exp = entry[1]
        refresh_token = entry[2] if len(entry) > 2 else None
        # Jika token masih aktif lebih dari 60 detik, gunakan langsung
        if exp > now + timedelta(seconds=60):
            return token
        # Token kedaluwarsa atau mendekati kedaluwarsa (<60 detik), coba refresh jika punya refresh token
        if refresh_token:
            refreshed = _try_refresh_dashboard_token(session_id, refresh_token)
            if refreshed:
                return refreshed
        if exp > now:
            return token

    from database import get_dashboard_session_data
    data = get_dashboard_session_data(session_id)
    if data:
        token = data.get("access_token")
        refresh_token = data.get("refresh_token")
        exp = data.get("exp")
        if token and (not exp or exp > now + timedelta(seconds=60)):
            _dashboard_tokens[session_id] = (token, exp or (now + timedelta(hours=1)), refresh_token)
            return token
        if refresh_token:
            refreshed = _try_refresh_dashboard_token(session_id, refresh_token)
            if refreshed:
                return refreshed
        if token and (not exp or exp > now):
            return token

    return None


def _session_dashboard_token(session_id: Optional[str]) -> Optional[str]:
    """Pulihkan token OIDC; izinkan sesi BFF aktif saat token upstream tidak ada."""
    if not session_id:
        raise _credentials_exception("Sesi tidak valid. Silakan login kembali.")
    try:
        token = _resolve_dashboard_token(session_id)
        if token:
            return token
        from database import get_user_session
        session = get_user_session(session_id)
        if not session or not session.get("is_active"):
            raise _credentials_exception("Sesi telah dihentikan. Silakan login kembali.")
        expires_at = session.get("expires_at")
        if expires_at:
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at <= datetime.now(timezone.utc):
                raise _credentials_exception("Sesi telah kedaluwarsa. Silakan login kembali.")
        return None
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Gagal memulihkan token OIDC dari sesi aktif")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Sesi belum dapat diverifikasi. Coba lagi.") from exc


def decode_session_cookie(token: str) -> Optional[dict]:
    """Validasi dan baca payload sesi dari cookie atau header."""
    if not token:
        return None
    try:
        return jwt.decode(token, settings.session_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        logger.debug("Session cookie kedaluwarsa.")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Session cookie tidak valid: {e}")
        return None
# --- FastAPI Dependencies ---

def _credentials_exception(detail: str = "Diperlukan autentikasi. Silakan login terlebih dahulu.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _extract_token_from_request(request: Request) -> Optional[str]:
    """Ambil token sesi dari cookie (prioritas) atau header Authorization (fallback)."""
    cookie_token = request.cookies.get(settings.session_cookie_name)
    if cookie_token:
        return cookie_token

    # Fallback header Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    return None


def get_current_principal(request: Request) -> dict:
    """Dependency otorisasi: mengembalikan data subjek & hak akses user.
    
    Interface standar: {sub, username, role, roles, org_units, is_guest}.
    """
    token = _extract_token_from_request(request)
    if not token:
        raise _credentials_exception("Diperlukan autentikasi. Silakan login terlebih dahulu.")

    payload = decode_session_cookie(token)
    if not payload or not payload.get("sub") or not payload.get("username") or not payload.get("roles") or payload.get("is_guest"):
        raise _credentials_exception("Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.")

    session_id = payload.get("session_id")
    resolved_token = _session_dashboard_token(session_id)
    set_dashboard_access_token(resolved_token)
    username = payload["username"]
    user_role = payload.get("role") or payload["roles"][0]
    user_roles = payload["roles"]
    return {
        "sub": payload["sub"],
        "username": username,
        "role": user_role,
        "roles": user_roles,
        "full_name": payload.get("full_name", ""),
        "assistant_persona": payload.get("assistant_persona", ""),
        "force_change_password": bool(payload.get("force_change_password", False)),
        "division_code": payload.get("division_code"),
        "division_name": payload.get("division_name"),
        "department_code": payload.get("department_code"),
        "department_name": payload.get("department_name") or ((payload.get("org_units") or [None])[0]),
        "job_level": payload.get("job_level"),
        "org_units": payload.get("org_units", []),
        "dashboard_token": resolved_token,
        "access_token": resolved_token,
        "session_id": session_id,
        "is_guest": False,
    }

def get_current_user_optional(request: Request) -> dict:
    """User yang sedang login, atau identitas tamu bila tidak ada sesi valid.
    
    Dipakai endpoint yang mengizinkan akses tamu (mis. chat kuota tamu, daftar server, mode chat).
    """
    guest_user = {
        "sub": "guest",
        "username": GUEST_USERNAME,
        "role": GUEST_ROLE,
        "roles": [GUEST_ROLE],
        "org_units": [],
        "is_guest": True,
    }
    token = _extract_token_from_request(request)
    if not token:
        set_dashboard_access_token(None)
        return guest_user

    try:
        payload = decode_session_cookie(token)
        if not payload or not payload.get("sub") or not payload.get("username") or not payload.get("roles") or payload.get("is_guest"):
            set_dashboard_access_token(None)
            return guest_user

        session_id = payload.get("session_id")
        resolved_token = _session_dashboard_token(session_id)
        set_dashboard_access_token(resolved_token)
        username = payload["username"]
        user_role = payload.get("role") or payload["roles"][0]
        user_roles = payload["roles"]
        return {
            "sub": payload["sub"],
            "username": username,
            "role": user_role,
            "roles": user_roles,
            "full_name": payload.get("full_name", ""),
            "assistant_persona": payload.get("assistant_persona", ""),
            "force_change_password": bool(payload.get("force_change_password", False)),
            "division_code": payload.get("division_code"),
            "division_name": payload.get("division_name"),
            "department_code": payload.get("department_code"),
            "department_name": payload.get("department_name") or ((payload.get("org_units") or [None])[0]),
            "job_level": payload.get("job_level"),
            "org_units": payload.get("org_units", []),
            "dashboard_token": resolved_token,
            "access_token": resolved_token,
            "session_id": session_id,
            "is_guest": False,
        }
    except Exception:
        set_dashboard_access_token(None)
        return guest_user

def get_current_user(principal: dict = Depends(get_current_principal)) -> dict:
    """Wrapper kompatibilitas untuk endpoint yang memanggil get_current_user."""
    return principal


def require_superadmin(principal: dict = Depends(get_current_principal)) -> dict:
    """Hanya untuk Super Admin."""
    roles = [str(r).lower() for r in principal.get("roles", [principal.get("role", "")])]
    if "superadmin" not in roles and principal.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak. Fitur ini hanya untuk Super Admin.",
        )
    return principal
