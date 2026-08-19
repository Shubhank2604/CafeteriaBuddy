from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="local", alias="APP_ENV")
    database_url: str = Field(
        default="sqlite:///data/apple_hill_cafe_bot.db", alias="DATABASE_URL"
    )
    data_dir: Path = Field(default=Path("data"), alias="DATA_DIR")
    teams_webhook_url: str | None = Field(default=None, alias="TEAMS_WEBHOOK_URL")
    ocr_provider: str = Field(default="local", alias="OCR_PROVIDER")
    azure_document_intelligence_endpoint: str | None = Field(
        default=None, alias="AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"
    )
    azure_document_intelligence_key: str | None = Field(
        default=None, alias="AZURE_DOCUMENT_INTELLIGENCE_KEY"
    )
    azure_document_intelligence_api_version: str = Field(
        default="2024-11-30", alias="AZURE_DOCUMENT_INTELLIGENCE_API_VERSION"
    )
    azure_document_intelligence_model_id: str = Field(
        default="prebuilt-layout", alias="AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID"
    )
    azure_document_intelligence_timeout_seconds: int = Field(
        default=60, alias="AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_SECONDS"
    )
    llm_provider: str = Field(default="stub", alias="LLM_PROVIDER")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-3-flash-preview", alias="GEMINI_MODEL")
    gemini_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        alias="GEMINI_BASE_URL",
    )
    embedding_provider: str = Field(default="local", alias="EMBEDDING_PROVIDER")


@lru_cache
def get_settings() -> Settings:
    return Settings()
