"""Events are delivered after the transaction commits, and never when it does not."""

import uuid
from collections.abc import AsyncIterator
from typing import Annotated

import httpx
import pytest
from fastapi import Depends, FastAPI
from sqlalchemy import String, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from ember.core.config import DbSettings
from ember.core.db import SessionDep, create_engine, create_session_factory, transaction
from ember.core.errors import Conflict
from ember.core.events import Event, EventBus, InProcessEventBus, get_event_bus
from ember.core.models import TenantModel
from ember.core.tenancy import TenantContext
from ember.entrypoints.api import create_app
from tests.conftest import make_settings


class Sprocket(TenantModel):
    __tablename__ = "test_sprockets"

    name: Mapped[str] = mapped_column(String, nullable=False)


class SprocketMade(Event):
    sprocket_name: str


# --- transaction() with a fake session (no Docker) -----------------------------------


class FakeSession:
    def __init__(self, fail_commit: bool = False) -> None:
        self.committed = False
        self.rolled_back = False
        self.fail_commit = fail_commit

    async def __aenter__(self) -> "FakeSession":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def commit(self) -> None:
        if self.fail_commit:
            raise RuntimeError("commit failed")
        self.committed = True

    async def rollback(self) -> None:
        self.rolled_back = True


def _bus_with_recorder() -> tuple[InProcessEventBus, list[SprocketMade]]:
    bus, received = InProcessEventBus(), []

    async def handler(event: SprocketMade) -> None:
        received.append(event)

    bus.subscribe(SprocketMade, handler)
    return bus, received


def _made() -> SprocketMade:
    return SprocketMade(tenant_id=uuid.uuid4(), sprocket_name="gear")


async def test_events_are_delivered_after_a_successful_commit() -> None:
    bus, received = _bus_with_recorder()
    session = FakeSession()
    seen_committed: list[bool] = []

    async def handler(event: SprocketMade) -> None:
        seen_committed.append(session.committed)

    bus.subscribe(SprocketMade, handler)

    async with transaction(lambda: session, bus):  # type: ignore[arg-type]
        await bus.publish(_made())
        assert received == []  # nothing is delivered while the work is still running

    assert session.committed
    assert len(received) == 1
    assert seen_committed == [True]  # the handler ran after the commit, not before


async def test_events_are_dropped_when_the_work_raises() -> None:
    bus, received = _bus_with_recorder()
    session = FakeSession()

    with pytest.raises(ValueError, match="boom"):
        async with transaction(lambda: session, bus):  # type: ignore[arg-type]
            await bus.publish(_made())
            raise ValueError("boom")

    assert session.rolled_back
    assert received == []


async def test_events_are_dropped_when_the_commit_fails() -> None:
    bus, received = _bus_with_recorder()
    session = FakeSession(fail_commit=True)

    with pytest.raises(RuntimeError, match="commit failed"):
        async with transaction(lambda: session, bus):  # type: ignore[arg-type]
            await bus.publish(_made())

    assert session.rolled_back
    assert received == []


# --- through the real app and Postgres (needs Docker) ---------------------------------


@pytest.fixture
async def engine(database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(make_settings(db=DbSettings(url=database_url)))  # type: ignore[arg-type]
    async with engine.begin() as connection:
        await connection.run_sync(Sprocket.__table__.create)
    yield engine
    await engine.dispose()


async def _count(factory: async_sessionmaker[AsyncSession]) -> int:
    async with factory() as session:
        return (await session.execute(select(func.count()).select_from(Sprocket))).scalar_one()


class Harness:
    def __init__(self, app: FastAPI, factory: async_sessionmaker[AsyncSession]) -> None:
        self.app = app
        self.factory = factory
        self.delivered: list[tuple[str, int, uuid.UUID | None]] = []

    def client(self) -> httpx.AsyncClient:
        transport = httpx.ASGITransport(app=self.app, raise_app_exceptions=False)
        return httpx.AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
def harness(engine: AsyncEngine, database_url: str) -> Harness:
    app = create_app(make_settings(db=DbSettings(url=database_url)))  # type: ignore[arg-type]
    harness = Harness(app, create_session_factory(engine))

    async def record(event: SprocketMade) -> None:
        # Count rows with a different connection: only committed rows are visible to it.
        harness.delivered.append(
            (event.sprocket_name, await _count(harness.factory), TenantContext.get())
        )

    app.state.event_bus.subscribe(SprocketMade, record)

    def add(session: AsyncSession, name: str | None) -> None:
        session.add(Sprocket(tenant_id=uuid.uuid4(), name=name))  # type: ignore[arg-type]

    @app.get("/test/made")
    async def made(session: SessionDep, bus: Annotated[EventBus, Depends(get_event_bus)]) -> None:
        add(session, "ok")
        await bus.publish(SprocketMade(tenant_id=TENANT, sprocket_name="ok"))

    @app.get("/test/two")
    async def two(session: SessionDep, bus: Annotated[EventBus, Depends(get_event_bus)]) -> None:
        add(session, "one")
        add(session, "two")
        await bus.publish(SprocketMade(tenant_id=TENANT, sprocket_name="one"))
        await bus.publish(SprocketMade(tenant_id=TENANT, sprocket_name="two"))

    @app.get("/test/app-error")
    async def app_error(
        session: SessionDep, bus: Annotated[EventBus, Depends(get_event_bus)]
    ) -> None:
        add(session, "rolled back")
        await bus.publish(SprocketMade(tenant_id=TENANT, sprocket_name="never"))
        raise Conflict("nope")

    @app.get("/test/commit-fails")
    async def commit_fails(
        session: SessionDep, bus: Annotated[EventBus, Depends(get_event_bus)]
    ) -> None:
        add(session, None)  # NOT NULL: the failure only surfaces when the dependency commits
        await bus.publish(SprocketMade(tenant_id=TENANT, sprocket_name="never"))

    return harness


TENANT = uuid.uuid4()


@pytest.mark.integration
async def test_the_handler_runs_after_the_row_is_committed(harness: Harness) -> None:
    async with harness.client() as client:
        response = await client.get("/test/made")

    assert response.status_code == 200
    # The handler counted rows through its own connection and already saw the row.
    assert harness.delivered == [("ok", 1, TENANT)]


@pytest.mark.integration
async def test_events_are_delivered_in_publication_order(harness: Harness) -> None:
    async with harness.client() as client:
        await client.get("/test/two")

    assert [name for name, _, _ in harness.delivered] == ["one", "two"]


@pytest.mark.integration
async def test_no_event_is_delivered_when_the_request_fails(
    harness: Harness, engine: AsyncEngine
) -> None:
    async with harness.client() as client:
        failed = await client.get("/test/app-error")

    assert failed.status_code == 409
    assert harness.delivered == []
    assert await _count(harness.factory) == 0


@pytest.mark.integration
async def test_no_event_is_delivered_when_the_commit_fails(harness: Harness) -> None:
    async with harness.client() as client:
        response = await client.get("/test/commit-fails")

    assert response.status_code == 500
    assert harness.delivered == []
    assert await _count(harness.factory) == 0


@pytest.mark.integration
async def test_a_failing_handler_does_not_undo_or_fail_the_request(harness: Harness) -> None:
    async def explode(event: SprocketMade) -> None:
        raise RuntimeError("handler bug")

    harness.app.state.event_bus.subscribe(SprocketMade, explode)

    async with harness.client() as client:
        response = await client.get("/test/made")

    assert response.status_code == 200
    assert await _count(harness.factory) == 1
    assert len(harness.delivered) == 1  # the other handler still ran
