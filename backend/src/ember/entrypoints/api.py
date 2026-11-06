"""HTTP API entrypoint. Wiring only: no business logic lives here."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import partial
from importlib.metadata import version

from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from redis.asyncio import Redis

from ember.core.config import Settings, get_settings
from ember.core.db import create_engine, create_session_factory
from ember.core.errors import register_error_handlers
from ember.core.health import build_health_router, check_database, check_redis
from ember.core.observability import RequestIdMiddleware, configure_logging, setup_telemetry
from ember.core.security import build_authenticator


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the API app. Run with ``uvicorn --factory ember.entrypoints.api:create_app``."""
    settings = settings or get_settings()
    configure_logging(settings)
    setup_telemetry(settings)

    # Both connect lazily, so creating them does no I/O.
    engine = create_engine(settings)
    redis = Redis.from_url(settings.redis.url.get_secret_value())
    # Until the identity module provides a real UserDirectory (F4), Entra tokens verify
    # but resolve to no user. Dev tokens work in local.
    authenticator = build_authenticator(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        await authenticator.aclose()
        await redis.aclose()
        await engine.dispose()

    app = FastAPI(
        title="Ember API",
        version=version("ember"),
        lifespan=lifespan,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        redoc_url=None,
    )
    app.state.session_factory = create_session_factory(engine)
    app.state.authenticator = authenticator
    register_error_handlers(app)
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
    app.add_middleware(RequestIdMiddleware)
    # Instrument last so the tracing middleware is outermost and the request span is
    # active while RequestIdMiddleware logs (log lines then carry trace_id).
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/health")
    return app
