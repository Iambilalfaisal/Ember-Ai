import asyncio
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import asyncpg
import httpx
import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy.engine import make_url
from testcontainers.community.postgres import PostgresContainer

from ember.core.config import DbSettings, RedisSettings, Settings
from ember.core.observability import setup_telemetry
from ember.entrypoints.api import create_app

BACKEND = Path(__file__).resolve().parent.parent


def make_settings(**overrides: object) -> Settings:
    """Settings that ignore ``.env`` and point at ports nothing listens on."""
    values: dict[str, object] = {
        "env": "test",
        "db": DbSettings(url="postgresql+asyncpg://u:p@127.0.0.1:1/x"),  # type: ignore[arg-type]
        "redis": RedisSettings(url="redis://127.0.0.1:1/0"),  # type: ignore[arg-type]
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


@pytest.fixture(scope="session", autouse=True)
def telemetry() -> tuple[InMemorySpanExporter, InMemoryMetricReader]:
    """Install in-memory OpenTelemetry providers before any app is created."""
    exporter = InMemorySpanExporter()
    reader = InMemoryMetricReader()
    setup_telemetry(make_settings(), span_exporter=exporter, metric_reader=reader)
    return exporter, reader


@pytest.fixture
def app() -> FastAPI:
    return create_app(make_settings())


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    # raise_app_exceptions=False so unhandled errors surface as the 500 a client would see.
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


# --- real Postgres (needs Docker) ---------------------------------------------


@pytest.fixture(scope="session")
def postgres() -> Iterator[PostgresContainer]:
    with PostgresContainer("pgvector/pgvector:pg16", driver="asyncpg") as container:
        yield container


def _run_admin_sql(container: PostgresContainer, sql: str) -> None:
    dsn = container.get_connection_url().replace("+asyncpg", "")

    async def run() -> None:
        connection = await asyncpg.connect(dsn)
        try:
            await connection.execute(sql)
        finally:
            await connection.close()

    asyncio.run(run())


@pytest.fixture
def database_url(postgres: PostgresContainer) -> str:
    """SQLAlchemy async URL of a new empty database inside the shared container."""
    name = f"t_{uuid.uuid4().hex[:12]}"
    _run_admin_sql(postgres, f'CREATE DATABASE "{name}"')
    url = make_url(postgres.get_connection_url()).set(database=name)
    return url.render_as_string(hide_password=False)


def alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    config.attributes["url"] = database_url
    config.attributes["configure_logging"] = False
    return config


@pytest.fixture
def migrated_database_url(database_url: str) -> str:
    """Like ``database_url``, with every Alembic migration applied (so tests use the real schema).

    A sync fixture on purpose: Alembic's async environment starts its own event loop.
    """
    command.upgrade(alembic_config(database_url), "head")
    return database_url
