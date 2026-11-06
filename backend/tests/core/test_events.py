import asyncio
import uuid
from datetime import timedelta

import pytest
from pydantic import ValidationError

from ember.core.events import Event, InProcessEventBus, NoUnitOfWork, NullEventBus
from ember.core.observability import configure_logging
from ember.core.tenancy import TenantContext
from tests.conftest import make_settings


class DocumentIngested(Event):
    document_id: uuid.UUID


class BigDocumentIngested(DocumentIngested):
    pages: int


def _ingested(tenant_id: uuid.UUID | None = None) -> DocumentIngested:
    return DocumentIngested(tenant_id=tenant_id or uuid.uuid4(), document_id=uuid.uuid4())


# --- Event -----------------------------------------------------------------------------


def test_an_event_needs_a_tenant() -> None:
    with pytest.raises(ValidationError):
        DocumentIngested(document_id=uuid.uuid4())  # type: ignore[call-arg]


def test_an_event_gets_an_id_and_a_utc_timestamp() -> None:
    first, second = _ingested(), _ingested()

    assert first.event_id != second.event_id
    assert first.occurred_at.utcoffset() == timedelta(0)


def test_an_event_is_immutable() -> None:
    event = _ingested()

    with pytest.raises(ValidationError):
        event.document_id = uuid.uuid4()


# --- publishing and delivery ---------------------------------------------------------


async def test_publishing_outside_a_unit_of_work_is_an_error() -> None:
    with pytest.raises(NoUnitOfWork, match="DocumentIngested"):
        await InProcessEventBus().publish(_ingested())


async def test_events_are_delivered_when_the_unit_of_work_ends_normally() -> None:
    bus, received = InProcessEventBus(), []

    async def handler(event: DocumentIngested) -> None:
        received.append(event)

    bus.subscribe(DocumentIngested, handler)
    event = _ingested()

    async with bus.unit_of_work():
        await bus.publish(event)
        assert received == []

    assert received == [event]


async def test_events_are_dropped_when_the_unit_of_work_raises() -> None:
    bus, received = InProcessEventBus(), []

    async def handler(event: DocumentIngested) -> None:
        received.append(event)

    bus.subscribe(DocumentIngested, handler)

    with pytest.raises(ValueError, match="boom"):
        async with bus.unit_of_work():
            await bus.publish(_ingested())
            raise ValueError("boom")

    assert received == []


async def test_the_unit_of_work_is_over_afterwards() -> None:
    bus = InProcessEventBus()
    async with bus.unit_of_work():
        pass

    with pytest.raises(NoUnitOfWork):
        await bus.publish(_ingested())
    async with bus.unit_of_work():  # and a new one can start
        pass


async def test_units_of_work_do_not_nest() -> None:
    bus = InProcessEventBus()

    async with bus.unit_of_work():
        with pytest.raises(RuntimeError, match="already active"):
            async with bus.unit_of_work():
                pass


async def test_concurrent_units_of_work_keep_their_events_apart() -> None:
    bus, received = InProcessEventBus(), []

    async def handler(event: DocumentIngested) -> None:
        received.append(event.document_id)

    bus.subscribe(DocumentIngested, handler)

    async def job(event: DocumentIngested, fail: bool) -> None:
        try:
            async with bus.unit_of_work():
                await bus.publish(event)
                await asyncio.sleep(0.01)  # the other job runs while this one is open
                if fail:
                    raise ValueError("boom")
        except ValueError:
            pass

    kept, dropped = _ingested(), _ingested()
    await asyncio.gather(job(kept, fail=False), job(dropped, fail=True))

    assert received == [kept.document_id]


async def test_handlers_run_in_registration_order_and_in_publication_order() -> None:
    bus, calls = InProcessEventBus(), []

    async def first(event: DocumentIngested) -> None:
        calls.append(("first", event.document_id))

    async def second(event: DocumentIngested) -> None:
        calls.append(("second", event.document_id))

    bus.subscribe(DocumentIngested, first)
    bus.subscribe(DocumentIngested, second)
    one, two = _ingested(), _ingested()

    async with bus.unit_of_work():
        await bus.publish(one)
        await bus.publish(two)

    assert calls == [
        ("first", one.document_id),
        ("second", one.document_id),
        ("first", two.document_id),
        ("second", two.document_id),
    ]


async def test_a_handler_for_a_base_class_also_receives_subclass_events() -> None:
    bus, seen = InProcessEventBus(), []

    async def on_any(event: Event) -> None:
        seen.append(("any", type(event).__name__))

    async def on_document(event: DocumentIngested) -> None:
        seen.append(("document", type(event).__name__))

    bus.subscribe(Event, on_any)
    bus.subscribe(DocumentIngested, on_document)
    big = BigDocumentIngested(tenant_id=uuid.uuid4(), document_id=uuid.uuid4(), pages=9)

    async with bus.unit_of_work():
        await bus.publish(big)

    assert sorted(seen) == [("any", "BigDocumentIngested"), ("document", "BigDocumentIngested")]


async def test_an_event_with_no_handlers_is_simply_dropped() -> None:
    bus = InProcessEventBus()

    async with bus.unit_of_work():
        await bus.publish(_ingested())


async def test_handlers_run_with_the_events_tenant_as_the_current_tenant() -> None:
    bus, seen = InProcessEventBus(), []

    async def handler(event: DocumentIngested) -> None:
        seen.append(TenantContext.get())

    bus.subscribe(DocumentIngested, handler)
    tenant = uuid.uuid4()

    async with bus.unit_of_work():
        await bus.publish(_ingested(tenant))

    assert seen == [tenant]
    assert TenantContext.get() is None


# --- handler failures ------------------------------------------------------------------


async def test_a_failing_handler_does_not_stop_the_others_or_raise(
    capsys: pytest.CaptureFixture[str],
) -> None:
    configure_logging(make_settings())
    bus, calls = InProcessEventBus(), []

    async def broken(event: DocumentIngested) -> None:
        raise RuntimeError("handler bug")

    async def fine(event: DocumentIngested) -> None:
        calls.append(event.document_id)

    bus.subscribe(DocumentIngested, broken)
    bus.subscribe(DocumentIngested, fine)
    event = _ingested()

    async with bus.unit_of_work():
        await bus.publish(event)

    assert calls == [event.document_id]
    output = capsys.readouterr().out
    assert '"event": "event.handler_failed"' in output
    assert '"event_type": "DocumentIngested"' in output
    assert str(event.event_id) in output
    assert "broken" in output  # the handler is named


async def test_the_failure_log_does_not_contain_the_event_payload(
    capsys: pytest.CaptureFixture[str],
) -> None:
    configure_logging(make_settings())
    bus = InProcessEventBus()

    async def broken(event: DocumentIngested) -> None:
        raise RuntimeError("handler bug")

    bus.subscribe(DocumentIngested, broken)
    event = _ingested()

    async with bus.unit_of_work():
        await bus.publish(event)

    assert str(event.document_id) not in capsys.readouterr().out


async def test_a_handler_cannot_publish_more_events_it_must_start_a_job() -> None:
    bus, failures = InProcessEventBus(), []

    async def republishing(event: DocumentIngested) -> None:
        try:
            await bus.publish(_ingested())
        except NoUnitOfWork:
            failures.append("no unit of work")

    bus.subscribe(DocumentIngested, republishing)

    async with bus.unit_of_work():
        await bus.publish(_ingested())

    assert failures == ["no unit of work"]


# --- NullEventBus ----------------------------------------------------------------------


async def test_the_null_bus_accepts_and_drops_everything() -> None:
    bus, received = NullEventBus(), []

    async def handler(event: DocumentIngested) -> None:
        received.append(event)

    bus.subscribe(DocumentIngested, handler)
    await bus.publish(_ingested())  # not even a unit of work is needed
    async with bus.unit_of_work():
        await bus.publish(_ingested())

    assert received == []
