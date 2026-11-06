"""Background jobs on Taskiq (Redis streams).

Modules declare tasks in their ``tasks.py`` with the ``task`` decorator and send them with
``Task.enqueue``. Nothing here reads settings at import time: the decorator only records the task,
and an entrypoint builds the broker (``build_broker``) and ``bind``s the registry to it, so the
API (which enqueues) and the worker (which runs) share the same task definitions::

    @task("documents.ingest_document")
    async def ingest_document(tenant_id: uuid.UUID, document_id: uuid.UUID, session: JobSession):
        ...

    await ingest_document.enqueue(tenant_id=tenant_id, document_id=document_id)

By default a task is tenant-scoped: it must take ``tenant_id``, and it runs with that tenant as
the current one, so repositories work exactly as in a request. ``JobSession`` is the job's one
transaction (committed on success, rolled back if the task raises, events delivered after the
commit). Delivery is at least once: a task must be safe to run twice. Retries and dead-lettering
are not configured yet.

``cron`` marks a daily or periodic job. A scheduled task has no tenant, so it is not
tenant-scoped; it looks up the tenants and ``enqueue``s one tenant-scoped task for each.
"""

import functools
import inspect
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated, Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from structlog.contextvars import bound_contextvars
from taskiq import (
    AsyncBroker,
    AsyncTaskiqTask,
    TaskiqDepends,
    TaskiqEvents,
    TaskiqScheduler,
    TaskiqState,
)
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import RedisAsyncResultBackend, RedisStreamBroker

from ember.core.config import Settings
from ember.core.db import create_engine, create_session_factory, transaction
from ember.core.events import EventBus
from ember.core.tenancy import TenantContext

logger = structlog.get_logger(__name__)

STATE_ENGINE = "engine"
STATE_SESSION_FACTORY = "session_factory"
STATE_EVENT_BUS = "event_bus"


class TasksNotConfigured(RuntimeError):
    """A task was enqueued before an entrypoint bound the registry to a broker."""


@dataclass(frozen=True, slots=True)
class Task:
    """A declared background task. Send it with :meth:`enqueue`."""

    name: str
    func: Callable[..., Awaitable[Any]]
    tenant_scoped: bool
    cron: str | None
    registry: "TaskRegistry"

    async def enqueue(self, *args: Any, **kwargs: Any) -> AsyncTaskiqTask[Any]:
        """Send the task to the queue and return a handle to its eventual result.

        Raises:
            TasksNotConfigured: no broker is bound.
            TypeError: the arguments do not fit the task's parameters.
        """
        return await self.registry.enqueue(self, args, kwargs)


class TaskRegistry:
    """The tasks declared so far, and the broker they are sent through."""

    def __init__(self) -> None:
        self._tasks: dict[str, Task] = {}
        self._broker: AsyncBroker | None = None

    @property
    def tasks(self) -> dict[str, Task]:
        return dict(self._tasks)

    def task(
        self, name: str, *, tenant_scoped: bool = True, cron: str | None = None
    ) -> Callable[[Callable[..., Awaitable[Any]]], Task]:
        """Declare a task named ``name`` (unique, e.g. ``"documents.ingest_document"``).

        Raises (when applied):
            ValueError: the name is taken, or ``cron`` is combined with ``tenant_scoped``.
            TypeError: a tenant-scoped task has no ``tenant_id`` parameter.
        """
        if cron is not None and tenant_scoped:
            raise ValueError(
                f"{name}: a scheduled task runs without a tenant; "
                "pass tenant_scoped=False and enqueue one tenant-scoped task per tenant"
            )

        def decorator(func: Callable[..., Awaitable[Any]]) -> Task:
            if name in self._tasks:
                raise ValueError(f"A task named {name!r} is already declared")
            if tenant_scoped and "tenant_id" not in inspect.signature(func).parameters:
                raise TypeError(f"{name}: a tenant-scoped task needs a 'tenant_id' parameter")
            declared = Task(name, func, tenant_scoped, cron, self)
            self._tasks[name] = declared
            return declared

        return decorator

    def register_all(self, broker: AsyncBroker) -> None:
        """Make every declared task known to ``broker`` (safe to repeat)."""
        known = broker.get_all_tasks()
        for declared in self._tasks.values():
            if declared.name in known:
                continue
            labels: dict[str, Any] = {}
            if declared.cron is not None:
                labels["schedule"] = [{"cron": declared.cron}]
            broker.register_task(_wrap(declared), task_name=declared.name, **labels)

    def bind(self, broker: AsyncBroker) -> None:
        """Send tasks through ``broker`` from now on, and register them on it."""
        self._broker = broker
        self.register_all(broker)

    async def enqueue(
        self, declared: Task, args: tuple[Any, ...], kwargs: dict[str, Any]
    ) -> AsyncTaskiqTask[Any]:
        if self._broker is None:
            raise TasksNotConfigured(
                f"{declared.name} cannot be enqueued: no broker is bound (see entrypoints)."
            )
        # Fail here, in the caller, rather than later in the worker.
        bound = inspect.signature(declared.func).bind_partial(*args, **kwargs)
        if declared.tenant_scoped and "tenant_id" not in bound.arguments:
            raise TypeError(f"{declared.name} is tenant-scoped: pass tenant_id")
        registered = self._broker.find_task(declared.name)
        if registered is None:
            raise TasksNotConfigured(f"{declared.name} is not registered on the bound broker.")
        return await registered.kiq(*args, **kwargs)


def _wrap(declared: Task) -> Callable[..., Awaitable[Any]]:
    """The function the worker runs: the task, with logging context and the tenant set."""
    signature = inspect.signature(declared.func)

    @functools.wraps(declared.func)
    async def run(*args: Any, **kwargs: Any) -> Any:
        with bound_contextvars(task=declared.name):
            if not declared.tenant_scoped:
                return await declared.func(*args, **kwargs)
            tenant_id = signature.bind_partial(*args, **kwargs).arguments["tenant_id"]
            tenant_id = tenant_id if isinstance(tenant_id, uuid.UUID) else uuid.UUID(str(tenant_id))
            with TenantContext.use(tenant_id), bound_contextvars(tenant_id=str(tenant_id)):
                return await declared.func(*args, **kwargs)

    return run


registry = TaskRegistry()
task = registry.task


# --- broker, scheduler, job resources -----------------------------------------------


def build_broker(settings: Settings) -> AsyncBroker:
    """Taskiq broker on Redis streams (a message is acknowledged once its result is saved)."""
    url = settings.redis.url.get_secret_value()
    broker = RedisStreamBroker(url, queue_name=settings.tasks.queue_name)
    return broker.with_result_backend(
        RedisAsyncResultBackend(url, result_ex_time=settings.tasks.result_ttl_seconds)
    )


def build_scheduler(broker: AsyncBroker) -> TaskiqScheduler:
    """Scheduler that enqueues every task declared with ``cron``."""
    return TaskiqScheduler(broker=broker, sources=[LabelScheduleSource(broker)])


def attach_job_resources(broker: AsyncBroker, settings: Settings, events: EventBus) -> None:
    """Give a worker's tasks a database engine and the event bus (see ``JobSession``).

    The engine is created when the worker starts and disposed when it stops.
    """

    async def startup(state: TaskiqState) -> None:
        engine = create_engine(settings)
        state[STATE_ENGINE] = engine
        state[STATE_SESSION_FACTORY] = create_session_factory(engine)
        state[STATE_EVENT_BUS] = events

    async def shutdown(state: TaskiqState) -> None:
        await state[STATE_ENGINE].dispose()

    broker.add_event_handler(TaskiqEvents.WORKER_STARTUP, startup)
    broker.add_event_handler(TaskiqEvents.WORKER_SHUTDOWN, shutdown)


async def job_session(
    state: Annotated[TaskiqState, TaskiqDepends()],
) -> AsyncIterator[AsyncSession]:
    """The job's database session: one transaction, committed if the task succeeds."""
    factory: async_sessionmaker[AsyncSession] = state[STATE_SESSION_FACTORY]
    async with transaction(factory, state[STATE_EVENT_BUS]) as session:
        yield session


JobSession = Annotated[AsyncSession, TaskiqDepends(job_session)]
