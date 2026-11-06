"""Domain events: what happened, announced after the transaction that caused it has committed.

A module publishes an ``Event`` from its service; other modules (and its own tasks) react
through handlers they register in their ``events.py``. The bus collects events during a *unit of
work* (a request or a job) and delivers them only after that unit's transaction commits. If the
transaction rolls back, or the commit fails, nothing is delivered, so no one is told about
something that did not happen.

Delivery is in-process, in order, and best effort: a failing handler is logged and does not
affect the committed request or the other handlers, and events are not stored, so one that is
lost (a crash between commit and delivery) is lost. Handlers should therefore be quick and hand
real work to a background task. Add an outbox if a consumer ever needs a guarantee.
"""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from contextvars import ContextVar
from datetime import datetime
from typing import Protocol, cast

import structlog
from fastapi import Request
from pydantic import BaseModel, ConfigDict, Field

from ember.core.models import utcnow
from ember.core.tenancy import TenantContext

logger = structlog.get_logger(__name__)


class Event(BaseModel):
    """Base class of every event. Name subclasses in the past tense (``DocumentIngested``).

    Events describe tenant data, so each carries its ``tenant_id``; handlers run with that
    tenant as the current one. Keep payloads to ids and small facts: events must not carry
    transcript text, email bodies, document content or other personal data.
    """

    model_config = ConfigDict(frozen=True)

    tenant_id: uuid.UUID
    event_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    occurred_at: datetime = Field(default_factory=utcnow)


type EventHandler[E: Event] = Callable[[E], Awaitable[None]]


class NoUnitOfWork(RuntimeError):
    """An event was published outside a request or job, so nothing could deliver it."""


class EventBus(Protocol):
    def subscribe[E: Event](self, event_type: type[E], handler: EventHandler[E]) -> None:
        """Call ``handler`` for every published ``event_type`` (and subclasses)."""
        ...

    async def publish(self, event: Event) -> None:
        """Queue ``event`` for delivery after the current unit of work commits.

        Raises:
            NoUnitOfWork: called outside a unit of work.
        """
        ...

    def unit_of_work(self) -> AbstractAsyncContextManager[None]:
        """Collect published events; deliver them if the block ends normally, drop them if not.

        Raises:
            RuntimeError: a unit of work is already active (there is one per request or job).
        """
        ...


# Events published in the current unit of work. ``None`` means no unit of work is active.
_pending_events: ContextVar[list[Event] | None] = ContextVar("ember_pending_events", default=None)


class InProcessEventBus:
    def __init__(self) -> None:
        self._handlers: dict[type[Event], list[EventHandler[Event]]] = {}

    def subscribe[E: Event](self, event_type: type[E], handler: EventHandler[E]) -> None:
        self._handlers.setdefault(event_type, []).append(cast(EventHandler[Event], handler))

    async def publish(self, event: Event) -> None:
        pending = _pending_events.get()
        if pending is None:
            raise NoUnitOfWork(
                f"{type(event).__name__} was published outside a request or job; "
                "events are only delivered after a unit of work commits."
            )
        pending.append(event)

    @asynccontextmanager
    async def unit_of_work(self) -> AsyncIterator[None]:
        if _pending_events.get() is not None:
            raise RuntimeError("A unit of work is already active; use one per request or job.")
        pending: list[Event] = []
        token = _pending_events.set(pending)
        try:
            yield
        finally:
            _pending_events.reset(token)
        # Reached only when the block ended without an exception.
        await self._deliver(pending)

    async def _deliver(self, events: list[Event]) -> None:
        for event in events:
            with TenantContext.use(event.tenant_id):
                for event_class in type(event).__mro__:
                    for handler in self._handlers.get(event_class, ()):
                        await self._call(handler, event)

    @staticmethod
    async def _call(handler: EventHandler[Event], event: Event) -> None:
        try:
            await handler(event)
        except Exception as exc:
            # Ids and names only, never the event payload. The traceback is kept for debugging,
            # like every other unhandled error.
            logger.error(
                "event.handler_failed",
                event_type=type(event).__name__,
                event_id=str(event.event_id),
                handler=getattr(handler, "__qualname__", repr(handler)),
                exc_info=exc,
            )


class NullEventBus:
    """Accepts and drops everything. For scripts and tests that do not care about events."""

    def subscribe[E: Event](self, event_type: type[E], handler: EventHandler[E]) -> None:
        return None

    async def publish(self, event: Event) -> None:
        return None

    @asynccontextmanager
    async def unit_of_work(self) -> AsyncIterator[None]:
        yield


def get_event_bus(request: Request) -> EventBus:
    """FastAPI dependency: the app's event bus."""
    return cast(EventBus, request.app.state.event_bus)
