"""Nama skema PostgreSQL dan SQL yang memakainya dari konfigurasi aplikasi."""
import re

from sqlalchemy import text as sqlalchemy_text

from config import settings

DB_SCHEMA = settings.database_schema
if not re.fullmatch(r"[a-z_][a-z0-9_]*", DB_SCHEMA):
    raise ValueError("DATABASE_SCHEMA harus berupa identifier PostgreSQL huruf kecil tanpa spasi atau tanda baca.")


def text(statement: str):
    """Masukkan nama skema tervalidasi ke SQL sebelum kompilasi SQLAlchemy."""
    return sqlalchemy_text(statement.replace("{DB_SCHEMA}", DB_SCHEMA))
