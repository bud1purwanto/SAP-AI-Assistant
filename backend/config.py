import os
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    """
    Konfigurasi untuk aplikasi Enterprise SAP Chat Assistant.
    Nilai akan diambil dari environment variables atau file .env.
    """
    ai_provider: str = "9router"

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

    assistant_persona: str = ""
    mcp_sap_config_json: str = ""
    mcp_rag_config_json: str = ""
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/ABAP_DB"

    # --- Autentikasi ---
    # WAJIB diisi di produksi. Bila kosong, sebuah secret acak dibuat saat startup,
    # yang berarti semua token menjadi tidak valid setiap kali proses di-restart
    # (dan tidak konsisten antar worker uvicorn).
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720  # 12 jam

    # --- Deployment ---
    # Daftar origin yang diizinkan, dipisahkan koma. "*" hanya untuk pengembangan.
    cors_allow_origins: str = "*"
    # Kuota prompt harian untuk pengunjung yang belum login (ditegakkan di server).
    guest_daily_limit: int = 1
    # Pembatasan percobaan login untuk menahan serangan tebak-password.
    login_max_failures: int = 8
    login_lock_seconds: int = 900  # 15 menit
    # Jumlah berkas hasil generate yang disimpan per user; yang terlama dibuang.
    artifact_max_per_user: int = 20

    # --- Riwayat percakapan ---
    # Anggaran token untuk riwayat yang disertakan ke model. Membatasi per token
    # (bukan per jumlah pesan) karena satu jawaban bertabel bisa setara puluhan
    # pesan pendek.
    history_token_budget: int = 3000
    # Jumlah giliran terakhir yang selalu dikirim apa adanya, tanpa dipadatkan.
    history_verbatim_turns: int = 3
    # Batas pesan yang diambil dari database sebelum penganggaran token; mencegah
    # sesi yang sangat panjang membebani query maupun memori.
    history_max_messages: int = 60
    # Password akun superadmin bootstrap ('TRSTDEV'), hanya dipakai saat tabel
    # users masih kosong. Harus segera diganti setelah login pertama.
    bootstrap_admin_password: str = "ChangeMe!2024"

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


settings = Settings()

# Secret ephemeral hanya sebagai jaring pengaman pengembangan; produksi harus set JWT_SECRET.
if not settings.jwt_secret:
    settings.jwt_secret = secrets.token_urlsafe(48)
    _EPHEMERAL_JWT_SECRET = True
else:
    _EPHEMERAL_JWT_SECRET = False
