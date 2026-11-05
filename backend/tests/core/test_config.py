import pytest
from pydantic import ValidationError

from ember.core.config import Settings


def _base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMBER_ENV", "staging")
    monkeypatch.setenv("EMBER_DB__URL", "postgresql+asyncpg://u:secret-pw@db:5432/ember")
    monkeypatch.setenv("EMBER_REDIS__URL", "redis://redis:6379/0")


def test_reads_nested_sections_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("EMBER_OBSERVABILITY__LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("EMBER_STORAGE__CONTAINER", "audio")

    settings = Settings(_env_file=None)

    assert settings.env == "staging"
    assert settings.db.url.get_secret_value().endswith("@db:5432/ember")
    assert settings.redis.url.get_secret_value() == "redis://redis:6379/0"
    assert settings.observability.log_level == "DEBUG"
    assert settings.storage.container == "audio"
    assert settings.auth.audience is None


def test_secrets_are_hidden_in_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("EMBER_OBSERVABILITY__LANGFUSE_SECRET_KEY", "sk-lf-very-secret")

    settings = Settings(_env_file=None)

    assert "secret-pw" not in repr(settings)
    assert "sk-lf-very-secret" not in repr(settings)


@pytest.mark.parametrize("env", ["local", "test", "staging", "production"])
def test_accepts_every_environment(monkeypatch: pytest.MonkeyPatch, env: str) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("EMBER_ENV", env)

    assert Settings(_env_file=None).env == env


def test_rejects_unknown_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("EMBER_ENV", "prod")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_env_has_no_default(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.delenv("EMBER_ENV")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_database_url_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.delenv("EMBER_DB__URL")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
