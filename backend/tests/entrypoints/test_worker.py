"""The worker entrypoint's wiring, without Redis or Docker."""

import uuid
from typing import Any

import pytest
from fastapi import FastAPI
from taskiq import AsyncBroker, TaskiqScheduler

from ember.core.config import TasksSettings
from ember.core.events import InProcessEventBus
from ember.core.tasks import registry
from ember.entrypoints.wiring import (
    _module_file,
    import_module_tasks,
    include_module_routers,
    register_module_event_handlers,
)
from ember.entrypoints.worker import create_broker, create_scheduler
from ember.modules.identity.events import UserInvited
from tests.conftest import make_settings


def test_the_broker_has_every_module_task_registered() -> None:
    broker = create_broker(make_settings())

    assert isinstance(broker, AsyncBroker)
    assert "identity.log_user_invited" in broker.get_all_tasks()


def test_the_broker_reads_its_queue_from_settings() -> None:
    broker = create_broker(make_settings(tasks=TasksSettings(queue_name="custom-queue")))

    assert broker.queue_name == "custom-queue"  # type: ignore[attr-defined]


def test_the_scheduler_is_built_on_the_same_tasks() -> None:
    scheduler = create_scheduler(make_settings())

    assert isinstance(scheduler, TaskiqScheduler)
    assert "identity.log_user_invited" in scheduler.broker.get_all_tasks()


def test_no_declared_task_runs_on_a_schedule_yet() -> None:
    import_module_tasks()

    assert [t.name for t in registry.tasks.values() if t.cron is not None] == []


async def test_modules_event_handlers_are_registered_on_the_bus(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[tuple[str, dict[str, Any]]] = []

    async def fake_enqueue(declared: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        sent.append((declared.name, kwargs))

    monkeypatch.setattr(registry, "enqueue", fake_enqueue)
    bus = InProcessEventBus()
    register_module_event_handlers(bus)
    tenant_id, user_id = uuid.uuid4(), uuid.uuid4()

    async with bus.unit_of_work():
        await bus.publish(UserInvited(tenant_id=tenant_id, user_id=user_id))

    assert sent == [("identity.log_user_invited", {"tenant_id": tenant_id, "user_id": user_id})]


def test_module_routers_are_mounted_under_the_api_prefix() -> None:
    app = FastAPI()
    include_module_routers(app)

    assert {"/api/v1/me", "/api/v1/users"} <= set(app.openapi()["paths"])


def test_discovery_only_touches_files_a_module_has() -> None:
    assert _module_file("identity", "no_such_file") is None
    assert _module_file("identity", "events") is not None
