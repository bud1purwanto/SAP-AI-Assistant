import os
from pydantic_settings import BaseSettings, SettingsConfigDict

import os
from pathlib import Path

ENV_PATH = Path(__file__).parent / ".env"

class Settings(BaseSettings):
    """
    Konfigurasi untuk aplikasi Enterprise SAP Chat Assistant.
    Nilai akan diambil dari environment variables atau file .env.
    """
    ai_provider: str = "openrouter"
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/auto"
    openrouter_fallback_model: str = "openrouter/free"
    assistant_persona: str = ""
    mcp_sap_config_json: str = ""
    mcp_rag_config_json: str = ""
    database_url: str = "postgresql+psycopg://postgres:postgres@192.168.1.232:5432/ABAP_DB"

    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
