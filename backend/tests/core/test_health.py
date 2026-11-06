import asyncio
from collections.abc import Iterator

import httpx
import pytest
from fastapi import FastAPI
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import create_async_engine
from testcontainers.community.postgres import PostgresContainer
from testcontainers.community.redis import RedisContainer

from ember.core.config import DbSettings, RedisSettings
from ember.core.errors import register_error_handlers
from ember.core.health import ReadinessCheck, build_health_router, check_database, check_redis
from ember.entrypoints.api import create_app
from tests.conftest import make_settings

PROBLEM_JSON = "application/problem+json"


async def _ok() -> None:
    return None


async def _fail() -> None:
    raise ConnectionError("postgresql://user:leaky-password@host/db")


async def _slow() -> None:
    await asyncio.sleep(5)


def _client(checks: dict[str, ReadinessCheck], timeout_seconds: float = 2.0) -> httpx.AsyncClient:
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(
        build_health_router(checks, timeout_seconds=timeout_seconds), prefix="/health"
    )
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_live_is_ok_and_does_not_check_dependencies() -> None:
    async with _client({"database": _fail}) as client:
        response = await client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready_is_ok_when_all_checks_pass() -> None:
    async with _client({"database": _ok, "redis": _ok}) as client:
        response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}


async def test_ready_is_503_problem_when_a_check_fails() -> None:
    async with _client({"database": _fail, "redis": _ok}) as client:
        response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    assert body["type"] == "urn:ember:problem:upstream-unavailable"
    assert body["checks"] == {"database": "failed", "redis": "ok"}
    assert "leaky-password" not in response.text


async def test_ready_fails_a_check_that_times_out() -> None:
    async with _client({"redis": _slow}, timeout_seconds=0.05) as client:
        response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"] == {"redis": "failed"}


async def test_api_ready_is_503_when_database_and_redis_are_unreachable() -> None:
    app = create_app(make_settings())
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        live = await client.get("/health/live")
        ready = await client.get("/health/ready")

    assert live.status_code == 200
    assert ready.status_code == 503
    assert ready.json()["checks"] == {"database": "failed", "redis": "failed"}


# --- against real services (needs Docker) ------------------------------------


@pytest.fixture(scope="module")
def redis_url() -> Iterator[str]:
    with RedisContainer("redis:7") as container:
        host = container.get_container_host_ip()
        yield f"redis://{host}:{container.get_exposed_port(6379)}/0"


@pytest.mark.integration
async def test_checks_succeed_against_real_services(
    postgres: PostgresContainer, redis_url: str
) -> None:
    engine = create_async_engine(postgres.get_connection_url())
    client = Redis.from_url(redis_url)
    try:
        await check_database(engine)
        await check_redis(client)
    finally:
        await client.aclose()
        await engine.dispose()


@pytest.mark.integration
async def test_api_ready_is_ok_against_real_services(
    postgres: PostgresContainer, redis_url: str
) -> None:
    settings = make_settings(
        db=DbSettings(url=postgres.get_connection_url()),  # type: ignore[arg-type]
        redis=RedisSettings(url=redis_url),  # type: ignore[arg-type]
    )
    app = create_app(settings)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}
