from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from ember.core.config import DbSettings, RedisSettings, Settings
from ember.core.observability import setup_telemetry
from ember.entrypoints.api import create_app


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
