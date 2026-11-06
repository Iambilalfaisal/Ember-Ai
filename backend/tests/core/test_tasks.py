"""The task registry, tenant handling and job sessions, on Taskiq's in-memory broker."""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from sqlalchemy import String, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column
from taskiq import InMemoryBroker
from taskiq.schedule_sources import LabelScheduleSource

from ember.core.config import DbSettings
from ember.core.db import create_engine, create_session_factory
from ember.core.events import Event, InProcessEventBus
from ember.core.models import TenantModel
from ember.core.tasks import (
    STATE_EVENT_BUS,
    STATE_SESSION_FACTORY,
    JobSession,
    TaskRegistry,
    TasksNotConfigured,
)
from ember.core.tenancy import TenantContext
from tests.conftest import make_settings


@pytest.fixture
def registry() -> TaskRegistry:
    """A fresh registry, so tests do not share the application's declared tasks."""
    return TaskRegistry()


@pytest.fixture
async def broker() -> AsyncIterator[InMemoryBroker]:
    broker = InMemoryBroker()
    await broker.startup()
    yield broker
    await broker.shutdown()


# --- declaring tasks -------------------------------------------------------------------


def test_a_task_name_can_only_be_declared_once(registry: TaskRegistry) -> None:
    @registry.task("demo.once")
    async def first(tenant_id: uuid.UUID) -> None: ...

    with pytest.raises(ValueError, match="already declared"):

        @registry.task("demo.once")
        async def second(tenant_id: uuid.UUID) -> None: ...


def test_a_tenant_scoped_task_needs_a_tenant_id_parameter(registry: TaskRegistry) -> None:
    with pytest.raises(TypeError, match="tenant_id"):

        @registry.task("demo.no_tenant")
        async def no_tenant(document_id: uuid.UUID) -> None: ...


def test_a_scheduled_task_cannot_be_tenant_scoped(registry: TaskRegistry) -> None:
    with pytest.raises(ValueError, match="without a tenant"):
        registry.task("demo.daily", cron="0 7 * * *")


def test_declared_tasks_are_listed(registry: TaskRegistry) -> None:
    @registry.task("demo.listed")
    async def listed(tenant_id: uuid.UUID) -> None: ...

    assert set(registry.tasks) == {"demo.listed"}
    assert registry.tasks["demo.listed"] is listed


# --- enqueueing ------------------------------------------------------------------------


async def test_enqueueing_before_a_broker_is_bound_is_an_error(registry: TaskRegistry) -> None:
    @registry.task("demo.unbound")
    async def unbound(tenant_id: uuid.UUID) -> None: ...

    with pytest.raises(TasksNotConfigured, match=r"demo\.unbound"):
        await unbound.enqueue(tenant_id=uuid.uuid4())


async def test_a_task_runs_with_its_tenant_as_the_current_tenant(
    registry: TaskRegistry, broker: InMemoryBroker
) -> None:
    @registry.task("demo.who")
    async def who(tenant_id: uuid.UUID, note: str) -> dict[str, Any]:
        return {"context": str(TenantContext.get()), "argument_type": type(tenant_id).__name__}

    registry.bind(broker)
    tenant = uuid.uuid4()

    handle = await who.enqueue(tenant_id=tenant, note="hello")
    result = await handle.wait_result(timeout=5)

    assert not result.is_err
    # The UUID went through JSON and came back as a UUID, and the tenant was set around the task.
    assert result.return_value == {"context": str(tenant), "argument_type": "UUID"}
    assert TenantContext.get() is None


async def test_tenant_id_can_be_passed_positionally(
    registry: TaskRegistry, broker: InMemoryBroker
) -> None:
    @registry.task("demo.positional")
    async def positional(tenant_id: uuid.UUID) -> str:
        return str(TenantContext.require())

    registry.bind(broker)
    tenant = uuid.uuid4()

    result = await (await positional.enqueue(tenant)).wait_result(timeout=5)

    assert result.return_value == str(tenant)


async def test_wrong_arguments_fail_at_enqueue_not_in_the_worker(
    registry: TaskRegistry, broker: InMemoryBroker
) -> None:
    @registry.task("demo.strict")
    async def strict(tenant_id: uuid.UUID, document_id: uuid.UUID) -> None: ...

    registry.bind(broker)

    with pytest.raises(TypeError):
        await strict.enqueue(tenant_id=uuid.uuid4(), no_such_argument=1)
    with pytest.raises(TypeError, match="tenant-scoped"):
        await strict.enqueue(document_id=uuid.uuid4())


async def test_a_failing_task_reports_an_error_result(
    registry: TaskRegistry, broker: InMemoryBroker
) -> None:
    @registry.task("demo.fails")
    async def fails(tenant_id: uuid.UUID) -> None:
        raise RuntimeError("task bug")

    registry.bind(broker)

    result = await (await fails.enqueue(tenant_id=uuid.uuid4())).wait_result(timeout=5)

    assert result.is_err
    assert TenantContext.get() is None


async def test_an_unscoped_task_runs_without_a_tenant(
    registry: TaskRegistry, broker: InMemoryBroker
) -> None:
    @registry.task("demo.fan_out", tenant_scoped=False)
    async def fan_out() -> str:
        return str(TenantContext.get())

    registry.bind(broker)

    result = await (await fan_out.enqueue()).wait_result(timeout=5)

    assert result.return_value == "None"


# --- registering on brokers, scheduling ------------------------------------------------


def test_registering_is_repeatable_and_works_for_several_brokers(registry: TaskRegistry) -> None:
    @registry.task("demo.shared")
    async def shared(tenant_id: uuid.UUID) -> None: ...

    first, second = InMemoryBroker(), InMemoryBroker()
    registry.register_all(first)
    registry.register_all(first)
    registry.bind(second)

    assert "demo.shared" in first.get_all_tasks()
    assert "demo.shared" in second.get_all_tasks()


async def test_cron_tasks_appear_in_the_schedule(registry: TaskRegistry) -> None:
    @registry.task("demo.daily", tenant_scoped=False, cron="0 7 * * *")
    async def daily() -> None: ...

    @registry.task("demo.on_demand")
    async def on_demand(tenant_id: uuid.UUID) -> None: ...

    broker = InMemoryBroker()
    registry.bind(broker)
    source = LabelScheduleSource(broker)
    await source.startup()

    schedules = await source.get_schedules()

    assert [(s.task_name, s.cron) for s in schedules] == [("demo.daily", "0 7 * * *")]


# --- job sessions (real Postgres, needs Docker) ----------------------------------------


class Gizmo(TenantModel):
    __tablename__ = "test_gizmos"

    name: Mapped[str] = mapped_column(String, nullable=False)


class GizmoMade(Event):
    name: str


@pytest.fixture
async def engine(database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(make_settings(db=DbSettings(url=database_url)))  # type: ignore[arg-type]
    async with engine.begin() as connection:
        await connection.run_sync(Gizmo.__table__.create)
    yield engine
    await engine.dispose()


async def _gizmos(factory: async_sessionmaker[AsyncSession]) -> int:
    async with factory() as session:
        return (await session.execute(select(func.count()).select_from(Gizmo))).scalar_one()


@pytest.mark.integration
async def test_a_job_session_commits_when_the_task_succeeds_and_delivers_events(
    registry: TaskRegistry, broker: InMemoryBroker, engine: AsyncEngine
) -> None:
    factory = create_session_factory(engine)
    bus, delivered = InProcessEventBus(), []

    async def on_made(event: GizmoMade) -> None:
        # Another connection: it only sees the gizmo if the job already committed.
        delivered.append((event.name, await _gizmos(factory), TenantContext.get()))

    bus.subscribe(GizmoMade, on_made)
    broker.state[STATE_SESSION_FACTORY] = factory
    broker.state[STATE_EVENT_BUS] = bus

    @registry.task("demo.make_gizmo")
    async def make_gizmo(tenant_id: uuid.UUID, name: str, session: JobSession) -> None:
        session.add(Gizmo(tenant_id=tenant_id, name=name))
        await bus.publish(GizmoMade(tenant_id=tenant_id, name=name))

    registry.bind(broker)
    tenant = uuid.uuid4()

    result = await (await make_gizmo.enqueue(tenant_id=tenant, name="cog")).wait_result(timeout=5)

    assert not result.is_err
    assert await _gizmos(factory) == 1
    assert delivered == [("cog", 1, tenant)]


@pytest.mark.integration
async def test_a_job_session_rolls_back_and_drops_events_when_the_task_fails(
    registry: TaskRegistry, broker: InMemoryBroker, engine: AsyncEngine
) -> None:
    factory = create_session_factory(engine)
    bus, delivered = InProcessEventBus(), []

    async def on_made(event: GizmoMade) -> None:
        delivered.append(event)

    bus.subscribe(GizmoMade, on_made)
    broker.state[STATE_SESSION_FACTORY] = factory
    broker.state[STATE_EVENT_BUS] = bus

    @registry.task("demo.make_then_fail")
    async def make_then_fail(tenant_id: uuid.UUID, session: JobSession) -> None:
        session.add(Gizmo(tenant_id=tenant_id, name="doomed"))
        await session.flush()
        await bus.publish(GizmoMade(tenant_id=tenant_id, name="doomed"))
        raise RuntimeError("task bug")

    registry.bind(broker)

    result = await (await make_then_fail.enqueue(tenant_id=uuid.uuid4())).wait_result(timeout=5)

    assert result.is_err
    assert await _gizmos(factory) == 0
    assert delivered == []
