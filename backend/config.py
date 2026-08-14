import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Konfigurasi untuk aplikasi Enterprise SAP Chat Assistant.
    Nilai akan diambil dari environment variables atau file .env.
    """
    openrouter_api_key: str = "your_openrouter_api_key_here"
    assistant_persona: str = ""
    mcp_sap_config_json: str = ""
    mcp_rag_config_json: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
