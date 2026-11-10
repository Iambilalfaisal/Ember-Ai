"""Live-call WebSocket entrypoint. Wiring only: no business logic lives here.

Run with ``uv run poe realtime`` (``uvicorn --factory ember.entrypoints.realtime:create_app``).
It serves ``/ws/v1/calls/{call_id}`` and the health endpoints; it is a separate process from the
API because it scales with concurrent calls, not with users (AGENTS.md section 1).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import partial
from importlib.metadata import version

import structlog
from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from redis.asyncio import Redis

from ember.adapters.ai.factory import build_fake_ai_gateway
from ember.adapters.ai.gateway import AiGateway
from ember.core.config import Settings, get_settings
from ember.core.db import create_engine, create_session_factory
from ember.core.health import build_health_router, check_database, check_redis
from ember.core.observability import configure_logging, setup_telemetry
from ember.core.security import build_authenticator
from ember.modules.calls.public import build_live_runtime, live_router
from ember.modules.identity.public import IdentityUserDirectory

logger = structlog.get_logger(__name__)


class FakePipelineNotAllowed(RuntimeError):
    """The realtime service was started in production with the fake answer pipeline."""


def create_app(settings: Settings | None = None, *, gateway: AiGateway | None = None) -> FastAPI:
    """Build the realtime app.

    ``gateway`` is the AI gateway the pipeline calls. Tests pass one built on fakes; without it
    the service builds a fake-provider gateway, because the real pipeline does not exist yet.

    Raises:
        FakePipelineNotAllowed: ``EMBER_ENV=production``, where reps would get fake answers.
    """
    settings = settings or get_settings()
    configure_logging(settings)
    setup_telemetry(settings)
    if settings.env == "production":
        raise FakePipelineNotAllowed(
            "The realtime service only has the fake answer pipeline so far; "
            "it must not run with EMBER_ENV=production."
        )
    logger.warning("realtime.fake_pipeline_active")

    # Everything connects lazily, so creating it does no I/O.
    engine = create_engine(settings)
    session_factory = create_session_factory(engine)
    redis = Redis.from_url(
        settings.redis.url.get_secret_value(),
        decode_responses=True,
        socket_timeout=settings.realtime.redis_timeout_seconds,
        socket_connect_timeout=settings.realtime.redis_timeout_seconds,
    )
    authenticator = build_authenticator(settings, IdentityUserDirectory(session_factory))
    # Validates ai_tasks.yaml now, so a bad file stops the service at startup.
    gateway = gateway or build_fake_ai_gateway(settings)
    runtime = build_live_runtime(settings, redis=redis, gateway=gateway)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        await gateway.aclose()
        await authenticator.aclose()
        await redis.aclose()
        await engine.dispose()

    app = FastAPI(
        title="Ember Realtime",
        version=version("ember"),
        lifespan=lifespan,
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )
    app.state.authenticator = authenticator
    app.state.live_runtime = runtime
    app.include_router(
        build_health_router(
            {
                "database": partial(check_database, engine),
                "redis": partial(check_redis, redis),
            }
        ),
        prefix="/health",
        tags=["health"],
    )
    app.include_router(live_router)
    # One span per connection with the stage spans under it; a span per message would be noise.
    FastAPIInstrumentor.instrument_app(
        app, excluded_urls="/health", exclude_spans=["receive", "send"]
    )
    return app
