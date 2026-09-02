import os
import secrets
from pathlib import Path
from dotenv import dotenv_values

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    """
    Konfigurasi Enterprise SAP AI Assistant.
    
    Catatan Arsitektur:
    - Infrastruktur server (Database URL, JWT Secret, CORS, Limits) dikonfigurasi via file .env / ENV server.
    - AI Provider (9Router, OpenRouter), MCP Servers (SAP, RAG, Email), Persona Organisasi, dan Skills
      disimpan secara dinamis di database PostgreSQL (tabel `ai_assistant.system_config` & `ai_assistant.skills`)
      dan dapat diubah secara live lewat Dashboard Admin (UI).
    """
    # ==============================================================================
    # 1. INFRASTRUKTUR SERVER & DATABASE (Wajib di .env untuk Level Server)
    # ==============================================================================
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/ABAP_DB"

    # --- Autentikasi & Keamanan JWT ---
    jwt_secret: str = "sap-ai-assistant-enterprise-secure-jwt-key-abap-2026-prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 43200  # 30 hari

    # --- Bootstrap Super Admin ---
    # Password akun superadmin bootstrap ('TRSTDEV'), hanya dipakai saat tabel users masih kosong.
    bootstrap_admin_password: str = "ChangeMe!2024"

    # --- CORS & Rate Limiting ---
    cors_allow_origins: str = "*"
    guest_daily_limit: int = 1

    # --- KUOTA TOKEN ---
    # Reset harian mengikuti tengah malam waktu setempat. Dengan UTC, kuota tim
    # di Indonesia akan reset pukul 07.00 pagi — di tengah jam kerja.
    quota_timezone: str = "Asia/Jakarta"
    # Penegakan batas dapat dimatikan admin; pencatatan pemakaian tetap jalan.
    token_limit_enabled: bool = False
    login_max_failures: int = 8
    login_lock_seconds: int = 900  # 15 menit
    artifact_max_per_user: int = 20

    # --- Penganggaran Riwayat Percakapan (History Context Limits) ---
    history_token_budget: int = 3000
    history_verbatim_turns: int = 3
    history_max_messages: int = 60

    # ==============================================================================
    # 2. DEFAULT FALLBACK / SEEDING AWAL (Dikelola Dinamis di Database & Web Admin)
    # ==============================================================================
    # 9Router (Primary / Local Gateway)
    nine_router_enabled: bool = True
    nine_router_base_url: str = "http://192.168.88.83:20128/v1"
    nine_router_model: str = "ag/gemini-3.7-flash-medium"
    nine_router_api_key: str = ""

    # OpenRouter (Fallback / Cloud Gateway)
    openrouter_enabled: bool = False
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/auto"
    openrouter_fallback_model: str = "openrouter/free"

    # Persona & MCP Config JSON Defaults
    assistant_persona: str = ""
    mcp_sap_config_json: str = ""
    mcp_rag_config_json: str = ""
    mcp_sql_config_json: str = ""
    mcp_email_config_json: str = ""

    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        raw = (self.cors_allow_origins or "").strip()
        if not raw or raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


def _load_settings() -> Settings:
    s = Settings()
    # Prioritaskan JWT_SECRET dari .env file jika ada di file
    if ENV_PATH.exists():
        dot_env_vals = dotenv_values(ENV_PATH)
        if dot_env_vals.get("JWT_SECRET"):
            s.jwt_secret = dot_env_vals["JWT_SECRET"]
    return s

settings = _load_settings()

# Secret ephemeral hanya sebagai jaring pengaman pengembangan; produksi harus set JWT_SECRET.
if not settings.jwt_secret:
    settings.jwt_secret = secrets.token_urlsafe(48)
    _EPHEMERAL_JWT_SECRET = True
else:
    _EPHEMERAL_JWT_SECRET = False
