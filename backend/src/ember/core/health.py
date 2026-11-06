"""Liveness and readiness endpoints.

``/health/live`` says the process is up and never touches dependencies.
``/health/ready`` checks that the database and Redis are reachable. These routes are
public and sit outside ``/api/v1`` so orchestrators can probe them without a token.
"""

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from typing import Literal

import structlog
from fastapi import APIRouter
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from ember.core.errors import UpstreamUnavailable

ReadinessCheck = Callable[[], Awaitable[None]]

logger = structlog.get_logger(__name__)


class LiveResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadyResponse(BaseModel):
    status: Literal["ok"] = "ok"
    checks: dict[str, Literal["ok"]]


async def check_database(engine: AsyncEngine) -> None:
    """Run ``SELECT 1`` on a pooled connection from the shared engine."""
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def check_redis(client: Redis) -> None:
    """Ping Redis."""
    await client.ping()


def build_health_router(
    checks: Mapping[str, ReadinessCheck],
    *,
    timeout_seconds: float = 2.0,
) -> APIRouter:
    """Build the health router. ``checks`` maps a dependency name to an async probe.

    A probe passes by returning and fails by raising or exceeding ``timeout_seconds``.
    """
    router = APIRouter()

    async def run(name: str, check: ReadinessCheck) -> tuple[str, str | None]:
        try:
            await asyncio.wait_for(check(), timeout=timeout_seconds)
        except Exception as exc:
            # Log the exception type only: messages can carry connection strings.
            logger.warning("health.check_failed", check=name, error_type=type(exc).__name__)
            return name, "failed"
        return name, None

    @router.get("/live", response_model=LiveResponse)
    async def live() -> LiveResponse:
        return LiveResponse()

    @router.get("/ready", response_model=ReadyResponse)
    async def ready() -> ReadyResponse:
        results = dict(await asyncio.gather(*(run(n, c) for n, c in checks.items())))
        if any(results.values()):
            raise UpstreamUnavailable(
                "Not ready.",
                extensions={"checks": {n: r or "ok" for n, r in results.items()}},
            )
        return ReadyResponse(checks={n: "ok" for n in results})

    return router
