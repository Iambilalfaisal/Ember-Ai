"""Application settings.

Everything is read from environment variables with the ``EMBER_`` prefix. Nested
sections use ``__`` as the delimiter, e.g. ``EMBER_DB__URL``. Secrets are
``SecretStr`` so they never show up in ``repr`` or logs. Keep ``.env.example`` in
sync with every field added here.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "staging", "production"]

# HS256 keys shorter than the hash size are weak (RFC 7518 section 3.2).
MIN_DEV_KEY_LENGTH = 32


class DbSettings(BaseModel):
    url: SecretStr
    """SQLAlchemy async URL, e.g. ``postgresql+asyncpg://user:pass@host:5432/db``."""


class RedisSettings(BaseModel):
    url: SecretStr


class AuthSettings(BaseModel):
    entra_tenant_id: str | None = None
    """Directory (tenant) id of the Entra ID app registration. Required in staging/production."""
    audience: str | None = None
    """The ``aud`` access tokens must carry (the API's application id URI or client id)."""
    authority: str = "https://login.microsoftonline.com"
    """Entra login host; change only for sovereign clouds."""
    jwks_cache_seconds: int = Field(default=3600, gt=0)
    """How long fetched signing keys are trusted before they are fetched again."""
    jwks_min_refresh_seconds: int = Field(default=60, gt=0)
    """Minimum gap between key fetches, so unknown key ids cannot trigger a fetch storm."""
    jwks_timeout_seconds: float = Field(default=5.0, gt=0)
    clock_skew_seconds: int = Field(default=30, ge=0)
    """Leeway applied to ``exp`` and ``nbf`` checks."""
    dev_signing_key: SecretStr | None = None
    """Enables signed dev tokens. Honoured only when ``EMBER_ENV=local``; never set elsewhere."""

    @field_validator("dev_signing_key")
    @classmethod
    def _dev_key_is_long_enough(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and len(value.get_secret_value()) < MIN_DEV_KEY_LENGTH:
            raise ValueError(f"dev_signing_key must be at least {MIN_DEV_KEY_LENGTH} characters")
        return value


class TasksSettings(BaseModel):
    """Background jobs (Taskiq on the Redis from ``redis.url``)."""

    queue_name: str = "ember"
    """Redis stream the workers read. Use a different name per environment sharing a Redis."""
    result_ttl_seconds: int = Field(default=3600, gt=0)
    """How long task results stay readable in Redis."""


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
    tasks: TasksSettings = TasksSettings()
    ai: AiSettings = AiSettings()
    stt: SttSettings = SttSettings()
    storage: StorageSettings = StorageSettings()
    observability: ObservabilitySettings = ObservabilitySettings()

    @model_validator(mode="after")
    def _dev_auth_only_in_local(self) -> "Settings":
        # Fail at startup, so a dev key copied into a real environment cannot go unnoticed.
        if self.env != "local" and self.auth.dev_signing_key is not None:
            raise ValueError("EMBER_AUTH__DEV_SIGNING_KEY may only be set when EMBER_ENV=local")
        return self


@lru_cache
def get_settings() -> Settings:
    """Load settings once per process from the environment and ``.env``."""
    return Settings()
