"""Autentikasi berbasis JWT dan hashing password.

Menggantikan pola lama yang mempercayai header `X-User-Name` dari klien —
header tersebut dapat dipalsukan siapa pun sehingga tidak memberi batas
keamanan apa pun antar user.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings

logger = logging.getLogger(__name__)

GUEST_USERNAME = "Guest"
GUEST_ROLE = "guest"

# auto_error=False supaya endpoint yang mengizinkan tamu tetap bisa dijalankan
# tanpa Authorization header.
_bearer = HTTPBearer(auto_error=False)


# --- Password hashing ---

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
        # Nilai bukan hash bcrypt yang valid (mis. sisa data plaintext lama).
        return False


def is_bcrypt_hash(value: str) -> bool:
    return bool(value) and value.startswith(("$2a$", "$2b$", "$2y$"))


# --- JWT ---

def create_access_token(username: str, role: str, roles: Optional[list] = None) -> str:
    now = datetime.now(timezone.utc)
    roles_list = roles if roles else [role]
    payload = {
        "sub": username,
        "role": role,
        "roles": roles_list,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# --- FastAPI dependencies ---

def _credentials_exception(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user_optional(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """User yang sedang login, atau identitas tamu bila tidak ada token valid.

    Dipakai endpoint yang memang boleh diakses tamu (mis. chat dengan kuota).
    """
    if creds is None or not creds.credentials:
        return {"username": GUEST_USERNAME, "role": GUEST_ROLE, "roles": [GUEST_ROLE], "is_guest": True}

    payload = decode_access_token(creds.credentials)
    if not payload or not payload.get("sub"):
        # Token kedaluwarsa / rusak: perlakukan sebagai tamu daripada menolak,
        # agar sesi lama tidak menutup akses mode tamu.
        return {"username": GUEST_USERNAME, "role": GUEST_ROLE, "roles": [GUEST_ROLE], "is_guest": True}

    user_role = payload.get("role", "user")
    user_roles = payload.get("roles") or [user_role]
    return {
        "username": payload["sub"],
        "role": user_role,
        "roles": user_roles,
        "is_guest": False,
    }


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """Wajib login. Menolak request tanpa token yang valid."""
    if creds is None or not creds.credentials:
        raise _credentials_exception("Diperlukan autentikasi. Silakan login terlebih dahulu.")

    payload = decode_access_token(creds.credentials)
    if not payload or not payload.get("sub"):
        raise _credentials_exception("Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.")

    user_role = payload.get("role", "user")
    user_roles = payload.get("roles") or [user_role]
    return {
        "username": payload["sub"],
        "role": user_role,
        "roles": user_roles,
        "is_guest": False,
    }


def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    """Hanya untuk superadmin.

    Role diambil dari token yang ditandatangani server, bukan dari input klien.
    """
    user_roles = [r.lower() for r in user.get("roles", [user.get("role", "")])]
    if "superadmin" not in user_roles and user.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak. Fitur ini hanya untuk Super Admin.",
        )
    return user
