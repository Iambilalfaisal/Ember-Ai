"""Application settings.

Everything is read from environment variables with the ``EMBER_`` prefix. Nested
sections use ``__`` as the delimiter, e.g. ``EMBER_DB__URL``. Secrets are
``SecretStr`` so they never show up in ``repr`` or logs. Keep ``.env.example`` in
sync with every field added here.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "staging", "production"]


class DbSettings(BaseModel):
    url: SecretStr
    """SQLAlchemy async URL, e.g. ``postgresql+asyncpg://user:pass@host:5432/db``."""


class RedisSettings(BaseModel):
    url: SecretStr


class AuthSettings(BaseModel):
    entra_tenant_id: str | None = None
    audience: str | None = None


class AiSettings(BaseModel):
    tasks_config_path: Path = Path("config/ai_tasks.yaml")


class SttSettings(BaseModel):
    api_key: SecretStr | None = None


class StorageSettings(BaseModel):
    account_url: str | None = None
    container: str = "calls"


class ObservabilitySettings(BaseModel):
    service_name: str = "ember"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    otlp_endpoint: str | None = None
    """Base URL of an OTLP/HTTP collector. Traces and metrics are not exported when unset."""
    langfuse_host: str | None = None
    langfuse_public_key: str | None = None
    langfuse_secret_key: SecretStr | None = None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="EMBER_",
        env_nested_delimiter="__",
        env_file=(".env", "../.env"),
        extra="ignore",
    )

    # No default on purpose: a missing value must fail loudly rather than fall back
    # to "local", which allows the dev auth bypass.
    env: Environment

    db: DbSettings
    redis: RedisSettings
    auth: AuthSettings = AuthSettings()
    ai: AiSettings = AiSettings()
    stt: SttSettings = SttSettings()
    storage: StorageSettings = StorageSettings()
    observability: ObservabilitySettings = ObservabilitySettings()


@lru_cache
def get_settings() -> Settings:
    """Load settings once per process from the environment and ``.env``."""
    return Settings()
