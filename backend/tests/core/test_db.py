import uuid
from collections.abc import AsyncIterator
from datetime import timedelta
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import String, func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from ember.core.config import DbSettings
from ember.core.db import SessionDep, create_engine, create_session_factory, get_session
from ember.core.errors import Conflict
from ember.core.models import Base, IdMixin, TenantMixin, TimestampMixin
from ember.entrypoints.api import create_app
from tests.conftest import make_settings


class Widget(Base, IdMixin, TenantMixin, TimestampMixin):
    __tablename__ = "test_widgets"

    name: Mapped[str] = mapped_column(String, nullable=False)


# --- get_session with a fake session (no Docker) -------------------------------


class FakeSession:
    def __init__(self) -> None:
        self.committed = False
        self.rolled_back = False

    async def __aenter__(self) -> "FakeSession":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        self.rolled_back = True


def _request_with(session: FakeSession) -> Any:
    state = SimpleNamespace(session_factory=lambda: session)
    return SimpleNamespace(app=SimpleNamespace(state=state))


async def test_get_session_commits_on_success() -> None:
    session = FakeSession()
    generator = get_session(_request_with(session))

    assert await anext(generator) is session
    with pytest.raises(StopAsyncIteration):
        await anext(generator)

    assert session.committed
    assert not session.rolled_back


async def test_get_session_rolls_back_and_reraises_on_error() -> None:
    session = FakeSession()
    generator = get_session(_request_with(session))
    await anext(generator)

    with pytest.raises(ValueError, match="boom"):
        await generator.athrow(ValueError("boom"))

    assert session.rolled_back
    assert not session.committed


# --- against real Postgres (needs Docker) --------------------------------------


@pytest.fixture
async def engine(database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(make_settings(db=DbSettings(url=database_url)))  # type: ignore[arg-type]
    async with engine.begin() as connection:
        await connection.run_sync(Widget.__table__.create)
    yield engine
    await engine.dispose()


@pytest.mark.integration
async def test_create_and_read_a_row_through_a_session(engine: AsyncEngine) -> None:
    factory = create_session_factory(engine)
    tenant_id = uuid.uuid4()

    async with factory() as session:
        widget = Widget(tenant_id=tenant_id, name="first")
        session.add(widget)
        await session.commit()
        widget_id = widget.id

    async with factory() as session:
        row = (await session.execute(select(Widget).where(Widget.id == widget_id))).scalar_one()

    assert isinstance(row.id, uuid.UUID)
    assert row.tenant_id == tenant_id
    assert row.name == "first"
    assert row.created_at.utcoffset() == timedelta(0)
    assert row.updated_at.utcoffset() == timedelta(0)


@pytest.mark.integration
async def test_updated_at_changes_on_update(engine: AsyncEngine) -> None:
    factory = create_session_factory(engine)
    async with factory() as session:
        widget = Widget(tenant_id=uuid.uuid4(), name="before")
        session.add(widget)
        await session.commit()
        created_at, first_updated_at = widget.created_at, widget.updated_at

        widget.name = "after"
        await session.commit()

    assert widget.created_at == created_at
    assert widget.updated_at > first_updated_at


@pytest.mark.integration
async def test_server_defaults_fill_rows_inserted_by_raw_sql(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text("INSERT INTO test_widgets (id, tenant_id, name) VALUES (:id, :tenant, 'raw')"),
            {"id": uuid.uuid4(), "tenant": uuid.uuid4()},
        )
        row = (await connection.execute(select(Widget.created_at, Widget.updated_at))).one()

    assert row.created_at is not None
    assert row.updated_at is not None


@pytest.mark.integration
async def test_connections_use_utc(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        timezone = (await connection.execute(text("SHOW timezone"))).scalar_one()

    assert timezone == "UTC"


async def _count_widgets(engine: AsyncEngine) -> int:
    async with engine.connect() as connection:
        return (await connection.execute(select(func.count()).select_from(Widget))).scalar_one()


def _widget_app(database_url: str) -> FastAPI:
    app = create_app(make_settings(db=DbSettings(url=database_url)))  # type: ignore[arg-type]

    @app.get("/test/ok")
    async def ok(session: SessionDep) -> None:
        session.add(Widget(tenant_id=uuid.uuid4(), name="ok"))

    @app.get("/test/app-error")
    async def app_error(session: SessionDep) -> None:
        session.add(Widget(tenant_id=uuid.uuid4(), name="rolled back"))
        raise Conflict("nope")

    @app.get("/test/crash")
    async def crash(session: SessionDep) -> None:
        session.add(Widget(tenant_id=uuid.uuid4(), name="rolled back"))
        raise RuntimeError("boom")

    @app.get("/test/commit-fails")
    async def commit_fails(session: SessionDep) -> None:
        # name is NOT NULL, so the failure only surfaces when the dependency commits.
        session.add(Widget(tenant_id=uuid.uuid4(), name=None))  # type: ignore[arg-type]

    return app


@pytest.mark.integration
async def test_session_dependency_commits_on_success_and_rolls_back_on_error(
    engine: AsyncEngine, database_url: str
) -> None:
    app = _widget_app(database_url)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        assert (await client.get("/test/ok")).status_code == 200
        assert await _count_widgets(engine) == 1

        assert (await client.get("/test/app-error")).status_code == 409
        assert (await client.get("/test/crash")).status_code == 500
        assert await _count_widgets(engine) == 1


@pytest.mark.integration
async def test_failed_commit_is_reported_to_the_client(
    engine: AsyncEngine, database_url: str
) -> None:
    app = _widget_app(database_url)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/test/commit-fails")

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/problem+json")
    assert await _count_widgets(engine) == 0


@pytest.mark.integration
async def test_each_request_gets_its_own_session(engine: AsyncEngine, database_url: str) -> None:
    app = _widget_app(database_url)
    seen: list[AsyncSession] = []

    @app.get("/test/session")
    async def session_route(session: SessionDep) -> None:
        seen.append(session)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/test/session")
        await client.get("/test/session")

    assert len(seen) == 2
    assert seen[0] is not seen[1]
