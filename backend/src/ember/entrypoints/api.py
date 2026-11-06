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
from ember.core.events import InProcessEventBus
from ember.core.health import build_health_router, check_database, check_redis
from ember.core.observability import RequestIdMiddleware, configure_logging, setup_telemetry
from ember.core.security import build_authenticator
from ember.core.tasks import build_broker, registry
from ember.entrypoints.wiring import (
    API_PREFIX,
    import_module_tasks,
    include_module_routers,
    register_module_event_handlers,
)
from ember.modules.identity.public import IdentityUserDirectory


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the API app. Run with ``uvicorn --factory ember.entrypoints.api:create_app``."""
    settings = settings or get_settings()
    configure_logging(settings)
    setup_telemetry(settings)

    # Both connect lazily, so creating them does no I/O.
    engine = create_engine(settings)
    redis = Redis.from_url(settings.redis.url.get_secret_value())
    session_factory = create_session_factory(engine)
    authenticator = build_authenticator(settings, IdentityUserDirectory(session_factory))
    # Event handlers run in this process; the broker only sends jobs for the worker to run.
    events = InProcessEventBus()
    register_module_event_handlers(events)
    broker = build_broker(settings)
    import_module_tasks()
    registry.bind(broker)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        await broker.startup()
        yield
        await broker.shutdown()
        await authenticator.aclose()
        await redis.aclose()
        await engine.dispose()

    app = FastAPI(
        title="Ember API",
        version=version("ember"),
        lifespan=lifespan,
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
    )
    app.state.session_factory = session_factory
    app.state.event_bus = events
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
    include_module_routers(app)
    app.add_middleware(RequestIdMiddleware)
    # Instrument last so the tracing middleware is outermost and the request span is
    # active while RequestIdMiddleware logs (log lines then carry trace_id).
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/health")
    return app
