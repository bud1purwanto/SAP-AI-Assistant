"""Autentikasi SAP Assistant via Dashboard OIDC BFF & Session Cookie.

Meniadakan JWT lokal dan hashing password di SAP AI Assistant.
Dashboard MCP bertindak sebagai otoritas identitas tunggal;
SAP mengelola sesi peramban lokal menggunakan HTTP-only signed session cookie.
"""
import base64
import contextvars
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status

from config import settings

logger = logging.getLogger(__name__)

GUEST_USERNAME = "Guest"
_dashboard_tokens: dict[str, tuple[str, datetime]] = {}
_dashboard_access_token: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("dashboard_access_token", default=None)
GUEST_ROLE = "guest"


# --- PKCE Helpers (RFC 7636) ---

def generate_code_verifier() -> str:
    """Buat code_verifier acak untuk PKCE flow (43-128 karakter URL-safe)."""
    return secrets.token_urlsafe(64)


def generate_code_challenge(verifier: str) -> str:
    """Buat code_challenge (S256) dari verifier."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


# --- Signed Session Cookie ---

def set_dashboard_access_token(token: Optional[str]) -> None:
    _dashboard_access_token.set(token.strip() if isinstance(token, str) and token.strip() else None)


def get_dashboard_access_token() -> Optional[str]:
    return _dashboard_access_token.get()


def create_session_cookie(principal: dict) -> str:
    """Tandatangani payload sesi menggunakan session_secret server."""
    now = datetime.now(timezone.utc)
    roles = principal.get("roles") or ([principal["role"]] if principal.get("role") else ["user"])
    primary_role = principal.get("role") or (roles[0] if roles else "user")
    
    payload = {
        "sub": str(principal.get("sub", "")),
        "username": str(principal.get("username") or principal.get("sub", "")),
        "role": primary_role,
        "roles": roles,
        "org_units": principal.get("org_units") or [],
        "is_guest": bool(principal.get("is_guest", False)),
        "iat": now,
        "exp": now + timedelta(hours=settings.session_expire_hours),
    }
    for k, v in principal.items():
        if k not in payload and k != "access_token":
            payload[k] = v
    access_token = principal.get("access_token")
    if access_token:
        session_id = secrets.token_urlsafe(32)
        _dashboard_tokens[session_id] = (str(access_token), payload["exp"])
        payload["session_id"] = session_id
    return jwt.encode(payload, settings.session_secret, algorithm="HS256")


def decode_session_cookie(token: str) -> Optional[dict]:
    """Validasi dan baca payload sesi dari cookie atau header."""
    if not token:
        return None
    try:
        return jwt.decode(token, settings.session_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        logger.debug("Sesi cookie kedaluwarsa.")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Sesi cookie tidak valid: {e}")
        return None


# --- FastAPI Dependencies ---

def _credentials_exception(detail: str = "Diperlukan autentikasi. Silakan login terlebih dahulu.") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
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
    """Dependency otorisasi BFF: mengembalikan data subjek & hak akses user.
    
    Interface standar: {sub, username, role, roles, org_units, is_guest}.
    """
    token = _extract_token_from_request(request)
    if not token:
        raise _credentials_exception("Diperlukan autentikasi. Silakan login terlebih dahulu.")

    payload = decode_session_cookie(token)
    if not payload or not payload.get("sub") or payload.get("is_guest"):
        raise _credentials_exception("Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.")

    session_id = payload.get("session_id")
    token_entry = _dashboard_tokens.get(session_id) if isinstance(session_id, str) else None
    set_dashboard_access_token(token_entry[0] if token_entry and token_entry[1] > datetime.now(timezone.utc) else None)

    user_role = payload.get("role", "user")
    user_roles = payload.get("roles") or [user_role]
    return {
        "sub": payload["sub"],
        "username": payload.get("username") or payload["sub"],
        "role": user_role,
        "roles": user_roles,
        "org_units": payload.get("org_units", []),
        "is_guest": False,
    }


def get_current_user_optional(request: Request) -> dict:
    """User yang sedang login, atau identitas tamu bila tidak ada sesi valid.
    
    Dipakai endpoint yang mengizinkan akses tamu (mis. chat kuota tamu).
    """
    token = _extract_token_from_request(request)
    if not token:
        return {
            "sub": "guest",
            "username": GUEST_USERNAME,
            "role": GUEST_ROLE,
            "roles": [GUEST_ROLE],
            "org_units": [],
            "is_guest": True,
        }

    payload = decode_session_cookie(token)
    if not payload or not payload.get("sub") or payload.get("is_guest"):
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
    set_dashboard_access_token(token_entry[0] if token_entry and token_entry[1] > datetime.now(timezone.utc) else None)

    user_role = payload.get("role", "user")
    user_roles = payload.get("roles") or [user_role]
    return {
        "sub": payload["sub"],
        "username": payload.get("username") or payload["sub"],
        "role": user_role,
        "roles": user_roles,
        "org_units": payload.get("org_units", []),
        "is_guest": False,
    }


def get_current_user(principal: dict = Depends(get_current_principal)) -> dict:
    """Wrapper kompatibilitas untuk endpoint yang memanggil get_current_user."""
    return principal


def require_superadmin(principal: dict = Depends(get_current_principal)) -> dict:
    """Hanya untuk Super Admin.
    
    Role diverifikasi dari sesi yang ditandatangani Dashboard OIDC.
    """
    roles = [r.lower() for r in principal.get("roles", [principal.get("role", "")])]
    if "superadmin" not in roles and principal.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak. Fitur ini hanya untuk Super Admin.",
        )
    return principal
