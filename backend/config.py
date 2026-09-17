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
      disimpan secara dinamis di database PostgreSQL (tabel `ai_assistant_dev.system_config` & `ai_assistant_dev.skills`)
      dan dapat diubah secara live lewat Dashboard Admin (UI).
    """
    # ==============================================================================
    # 1. INFRASTRUKTUR SERVER & DATABASE (Wajib di .env untuk Level Server)
    # ==============================================================================
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/ABAP_DB"
    auth_database_url: str = "postgresql://admin_rag:Trias123@192.168.1.162:5432/ai_auth"

    # --- Dashboard OIDC BFF ---
    # Autentikasi dilakukan via Dashboard OIDC; SAP bertindak sebagai BFF
    # dengan HTTP-only signed session cookie.
    dashboard_oidc_issuer: str = "http://127.0.0.1:3000"
    dashboard_oidc_client_id: str = "sap-ai-assistant"
    dashboard_oidc_client_secret: str | None = None
    dashboard_oidc_redirect_uri: str = "http://localhost:5173/api/auth/callback"
    dashboard_oidc_allowed_redirect_hosts: str = ""
    dashboard_jwks_url: str = ""
    dashboard_mcp_gateway_url: str = "http://127.0.0.1:3000/api/mcp"

    # --- Session Cookie ---
    session_cookie_name: str = "sap_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    session_secret: str = "sap-ai-assistant-enterprise-session-secret-abap-2026"
    session_expire_hours: int = 24

    # --- Standalone Auth & JWT ---
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720
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

    # Dashboard MCP Integration
    dashboard_mcp_url: str = "http://127.0.0.1:3000"
    dashboard_mcp_api_token: str = ""
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
    if ENV_PATH.exists():
        dot_env_vals = dotenv_values(ENV_PATH)
        if dot_env_vals.get("SESSION_SECRET"):
            s.session_secret = dot_env_vals["SESSION_SECRET"]
    return s


settings = _load_settings()
def get_settings() -> Settings:
    return settings

# Produksi: startup gagal bila seting Dashboard wajib tidak ada atau tidak aman.
_EPHEMERAL_SESSION_SECRET = False
if not settings.session_secret or settings.session_secret == settings.model_fields["session_secret"].default:
    if os.environ.get("ENV", "").lower() in ("prod", "production"):
        raise RuntimeError(
            "SESSION_SECRET wajib di-set di .env untuk produksi. "
            "Jangan pakai default — sesi dapat dipalsukan."
        )
    # Dev: pakai default dengan peringatan.
    _EPHEMERAL_SESSION_SECRET = True

if os.environ.get("ENV", "").lower() in ("prod", "production"):
    _localhost_hosts = ("localhost", "127.0.0.1", "0.0.0.0")
    for _url_attr in ("dashboard_oidc_issuer", "dashboard_oidc_redirect_uri", "dashboard_mcp_gateway_url"):
        _val = getattr(settings, _url_attr, "").strip()
        if not _val:
            raise RuntimeError(f"{_url_attr} wajib di-set untuk produksi.")
        if any(_h in _val for _h in _localhost_hosts):
            raise RuntimeError(
                f"{_url_attr} tidak boleh mengarah ke localhost/127.0.0.1 di produksi "
                f"(nilai: {_val})."
            )
    # client_secret wajib untuk confidential client; bila kosong (public client PKCE),
    # pastikan redirect_uri menggunakan HTTPS.
    if not settings.dashboard_oidc_client_secret:
        if not settings.dashboard_oidc_redirect_uri.startswith("https://"):
            raise RuntimeError(
                "DASHBOARD_OIDC_CLIENT_SECRET kosong (public client). "
                "Untuk produksi, redirect_uri harus menggunakan HTTPS."
            )
