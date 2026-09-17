"""Autentikasi SAP AI Assistant Standalone.

Mendukung hashing password lokal (bcrypt), JWT access token,
dan signed session cookie secara mandiri tanpa ketergantungan pada Dashboard OIDC.
"""
import base64
import contextvars
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status

from config import settings

logger = logging.getLogger(__name__)

GUEST_USERNAME = "Guest"
GUEST_ROLE = "guest"

_dashboard_tokens: dict[str, tuple[str, datetime]] = {}
_dashboard_access_token: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("dashboard_access_token", default=None)


# --- Password hashing (bcrypt) ---

def hash_password(password: str) -> str:
    """Hash password memakai bcrypt. Mengembalikan string siap simpan."""
    pwd = (password or "").encode("utf-8")
    # bcrypt hanya memakai 72 byte pertama; potong eksplisit agar tidak error.
    return bcrypt.hashpw(pwd[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verifikasi password terhadap hash bcrypt."""
    if not password or not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def is_bcrypt_hash(value: str) -> bool:
    """Periksa apakah string merupakan hash bcrypt yang valid."""
    return bool(value) and value.startswith(("$2a$", "$2b$", "$2y$"))


# --- Helper Secret & Token ---

def _get_signing_secret() -> str:
    """Ambil secret untuk menandatangani JWT atau cookie sesi."""
    secret = settings.jwt_secret or settings.session_secret
    if not secret:
        secret = "sap-ai-assistant-fallback-secret-2026"
    return secret


def _get_algorithm() -> str:
    return getattr(settings, "jwt_algorithm", "HS256") or "HS256"


# --- Standalone JWT Access Token ---

def create_access_token(username: str, role: str, roles: list = None, **claims) -> str:
    """Buat JWT access token mandiri untuk user."""
    now = datetime.now(timezone.utc)
    user_roles = roles or [role] if role else ["user"]
    primary_role = role or user_roles[0]
    expire_minutes = getattr(settings, "jwt_expire_minutes", 720) or 720

    payload: Dict[str, Any] = {
        "sub": str(username),
        "username": str(username),
        "role": primary_role,
        "roles": user_roles,
        "is_guest": False,
        "iat": now,
        "exp": now + timedelta(minutes=expire_minutes),
    }
    payload.update(claims)
    return jwt.encode(payload, _get_signing_secret(), algorithm=_get_algorithm())


def decode_access_token(token: str) -> Optional[dict]:
    """Validasi dan baca payload dari JWT access token."""
    if not token:
        return None
    try:
        return jwt.decode(token, _get_signing_secret(), algorithms=[_get_algorithm(), "HS256"])
    except jwt.ExpiredSignatureError:
        logger.debug("Access token kedaluwarsa.")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Access token tidak valid: {e}")
        return None


# --- Signed Session Cookie ---

def set_dashboard_access_token(token: Optional[str]) -> None:
    _dashboard_access_token.set(token.strip() if isinstance(token, str) and token.strip() else None)


def get_dashboard_access_token() -> Optional[str]:
    return _dashboard_access_token.get()


def create_session_cookie(principal: dict) -> str:
    """Tandatangani payload sesi menggunakan secret server."""
    now = datetime.now(timezone.utc)
    roles = principal.get("roles") or ([principal["role"]] if principal.get("role") else ["user"])
    primary_role = principal.get("role") or (roles[0] if roles else "user")
    expire_hours = getattr(settings, "session_expire_hours", 24) or 24

    payload: Dict[str, Any] = {
        "sub": str(principal.get("sub", "") or principal.get("username", "")),
        "username": str(principal.get("username") or principal.get("sub", "")),
        "role": primary_role,
        "roles": roles,
        "org_units": principal.get("org_units") or [],
        "is_guest": bool(principal.get("is_guest", False)),
        "iat": now,
        "exp": now + timedelta(hours=expire_hours),
    }
    for k, v in principal.items():
        if k not in payload and k != "access_token":
            payload[k] = v

    access_token = principal.get("access_token")
    if access_token:
        session_id = secrets.token_urlsafe(32)
        _dashboard_tokens[session_id] = (str(access_token), payload["exp"])
        payload["session_id"] = session_id

    return jwt.encode(payload, _get_signing_secret(), algorithm=_get_algorithm())


def decode_session_cookie(token: str) -> Optional[dict]:
    """Validasi dan baca payload sesi dari cookie atau header."""
    return decode_access_token(token)


# --- PKCE Helpers (RFC 7636) ---

def generate_code_verifier() -> str:
    """Buat code_verifier acak untuk PKCE flow (43-128 karakter URL-safe)."""
    return secrets.token_urlsafe(64)


def generate_code_challenge(verifier: str) -> str:
    """Buat code_challenge (S256) dari verifier."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


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
    if not payload or not (payload.get("sub") or payload.get("username")) or payload.get("is_guest"):
        raise _credentials_exception("Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.")

    session_id = payload.get("session_id")
    token_entry = _dashboard_tokens.get(session_id) if isinstance(session_id, str) else None
    resolved_token = (
        token_entry[0]
        if token_entry and token_entry[1] > datetime.now(timezone.utc)
        else (token if not payload.get("is_guest") else None)
    )
    set_dashboard_access_token(resolved_token)
    username = payload.get("username") or payload.get("sub")
    user_role = payload.get("role", "user")
    user_roles = payload.get("roles") or [user_role]
    return {
        "sub": payload.get("sub") or username,
        "username": username,
        "role": user_role,
        "roles": user_roles,
        "full_name": payload.get("full_name", ""),
        "assistant_persona": payload.get("assistant_persona", ""),
        "force_change_password": bool(payload.get("force_change_password", False)),
        "division_code": payload.get("division_code"),
        "division_name": payload.get("division_name"),
        "job_level": payload.get("job_level", "staff"),
        "org_units": payload.get("org_units", []),
        "dashboard_token": resolved_token,
        "access_token": resolved_token,
        "is_guest": False,
    }

def get_current_user_optional(request: Request) -> dict:
    """User yang sedang login, atau identitas tamu bila tidak ada sesi valid.
    
    Dipakai endpoint yang mengizinkan akses tamu (mis. chat kuota tamu).
    """
    token = _extract_token_from_request(request)
    if not token:
        set_dashboard_access_token(None)
        return {
            "sub": "guest",
            "username": GUEST_USERNAME,
            "role": GUEST_ROLE,
            "roles": [GUEST_ROLE],
            "org_units": [],
            "is_guest": True,
        }

    payload = decode_session_cookie(token)
    if not payload or not (payload.get("sub") or payload.get("username")) or payload.get("is_guest"):
        set_dashboard_access_token(None)
        return {
            "sub": "guest",
            "username": GUEST_USERNAME,
            "role": GUEST_ROLE,
            "roles": [GUEST_ROLE],
            "org_units": [],
            "is_guest": True,
        }

    session_id = payload.get("session_id")
    token_entry = _dashboard_tokens.get(session_id) if isinstance(session_id, str) else None
    resolved_token = (
        token_entry[0]
        if token_entry and token_entry[1] > datetime.now(timezone.utc)
        else (token if not payload.get("is_guest") else None)
    )
    set_dashboard_access_token(resolved_token)
    username = payload.get("username") or payload.get("sub")
    user_role = payload.get("role", "user")
    user_roles = payload.get("roles") or [user_role]
    return {
        "sub": payload.get("sub") or username,
        "username": username,
        "role": user_role,
        "roles": user_roles,
        "full_name": payload.get("full_name", ""),
        "assistant_persona": payload.get("assistant_persona", ""),
        "force_change_password": bool(payload.get("force_change_password", False)),
        "division_code": payload.get("division_code"),
        "division_name": payload.get("division_name"),
        "job_level": payload.get("job_level", "staff"),
        "org_units": payload.get("org_units", []),
        "dashboard_token": resolved_token,
        "access_token": resolved_token,
        "is_guest": False,
    }

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
