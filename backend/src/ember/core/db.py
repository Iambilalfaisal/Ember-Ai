"""Async database engine, session factory and the per-request session dependency.

One transaction per request or job: ``transaction`` commits when the work succeeds and rolls
back when it raises, and only then are the events published meanwhile delivered. Services and
repositories never commit.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ember.core.config import Settings
from ember.core.events import EventBus


def create_engine(settings: Settings) -> AsyncEngine:
    """Create the async engine. It connects lazily, so this does no I/O."""
    return create_async_engine(
        settings.db.url.get_secret_value(),
        pool_pre_ping=True,
        # Sessions always run in UTC so timestamptz values read back in UTC.
        connect_args={"server_settings": {"timezone": "UTC"}},
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    # expire_on_commit=False: objects stay readable after commit (no implicit lazy I/O).
    return async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def transaction(
    session_factory: async_sessionmaker[AsyncSession], events: EventBus
) -> AsyncIterator[AsyncSession]:
    """One unit of work: a session, committed on success and rolled back on any exception.

    Events published inside the block are delivered after the commit succeeds, and dropped if
    the block raises or the commit fails. Used by requests (``get_session``) and by jobs.
    """
    async with session_factory() as session, events.unit_of_work():
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield the request's session; commit on success, roll back on any exception."""
    factory = cast(async_sessionmaker[AsyncSession], request.app.state.session_factory)
    events = cast(EventBus, request.app.state.event_bus)
    async with transaction(factory, events) as session:
        yield session


# scope="function" ends the dependency (the commit) before the response is sent, so a
# client never sees success for a transaction that later fails to commit.
SessionDep = Annotated[AsyncSession, Depends(get_session, scope="function")]
