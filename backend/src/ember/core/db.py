"""Async database engine, session factory and the per-request session dependency.

One transaction per request: ``get_session`` commits when the route succeeds and rolls
back when it raises. Services and repositories never commit.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ember.core.config import Settings


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


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield the request's session; commit on success, roll back on any exception."""
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


# scope="function" ends the dependency (the commit) before the response is sent, so a
# client never sees success for a transaction that later fails to commit.
SessionDep = Annotated[AsyncSession, Depends(get_session, scope="function")]
