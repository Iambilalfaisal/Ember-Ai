"""The session: handshake, numbering, resume, the way out. Fake connection, in-memory store."""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import pytest
import structlog

from ember.modules.calls.live.pipeline import EmitCardEvent, Utterance
from ember.modules.calls.live.protocol import (
    CardDeltaPayload,
    CardEndPayload,
    CardStartPayload,
)
from ember.modules.calls.live.session import LiveRuntime
from tests.modules.calls.live.support import (
    CALL,
    OTHER_TENANT,
    OTHER_USER,
    TENANT,
    USER,
    FakeConnection,
    InMemorySessionStore,
    ScriptedPipeline,
    final_frame,
    frame,
    make_runtime,
    make_session,
    partial_frame,
    start_frame,
)

CARD = (
    CardStartPayload(card_id="c1", utterance_id="u1"),
    CardDeltaPayload(card_id="c1", text="Ten dollars."),
    CardEndPayload(card_id="c1", status="complete"),
)


@dataclass
class Rig:
    store: InMemorySessionStore = field(default_factory=InMemorySessionStore)
    pipeline: Any = field(default_factory=ScriptedPipeline)
    max_message_bytes: int = 4096
    start_timeout_seconds: float = 1.0
    tasks: list[asyncio.Task[None]] = field(default_factory=list)

    def runtime(self) -> LiveRuntime:
        return make_runtime(
            self.store,
            self.pipeline,
            max_message_bytes=self.max_message_bytes,
            start_timeout_seconds=self.start_timeout_seconds,
        )

    def connect(self, **identity: Any) -> tuple[FakeConnection, asyncio.Task[None]]:
        """A desktop connection with its session running; ``identity`` says who and which call."""
        connection = FakeConnection()
        task = asyncio.create_task(make_session(self.runtime(), connection, **identity).run())
        self.tasks.append(task)
        return connection, task

    async def started(self, **identity: Any) -> tuple[FakeConnection, asyncio.Task[None]]:
        connection, task = self.connect(**identity)
        connection.push(start_frame())
        await connection.wait_for_messages(1)
        return connection, task


@pytest.fixture
async def rig() -> AsyncIterator[Rig]:
    rig = Rig()
    yield rig
    for task in rig.tasks:
        task.cancel()
    # Bounded, so a session that will not stop fails the test instead of hanging the run.
    _, stuck = await asyncio.wait(rig.tasks, timeout=2) if rig.tasks else (set(), set())
    assert not stuck, "a session did not stop when cancelled"


def payloads(connection: FakeConnection, type_: str) -> list[dict[str, Any]]:
    return [message["payload"] for message in connection.sent if message["type"] == type_]


async def finish(connection: FakeConnection, task: asyncio.Task[None]) -> None:
    connection.disconnect()
    await asyncio.wait_for(task, 2)


# --- the handshake -------------------------------------------------------------


async def test_session_start_is_answered_with_session_ready(rig: Rig) -> None:
    connection, task = await rig.started()

    assert connection.sent == [
        {
            "v": 1,
            "type": "session.ready",
            "call_id": str(CALL),
            "seq": 1,
            "payload": {"resumed": False, "last_client_seq": 0},
        }
    ]
    assert connection.closed_with is None
    assert not task.done()
    assert rig.store.sessions[(TENANT, CALL)]["user_id"] == USER


@pytest.mark.parametrize(
    ("first", "code", "close"),
    [
        (final_frame(1, "How much?"), "session_not_started", 4400),
        (frame("session.end", 1), "session_not_started", 4400),
        ("not json", "invalid_message", 4400),
        (b"\x00\x01", "invalid_message", 4400),
        (start_frame(call_id=uuid.uuid4()), "call_id_mismatch", 4400),
        ("x" * 5000, "message_too_large", 1009),
    ],
)
async def test_anything_but_a_valid_session_start_first_is_fatal(
    rig: Rig, first: str | bytes, code: str, close: int
) -> None:
    connection, task = rig.connect()

    connection.push(first)

    assert await connection.wait_for_close() == close
    await asyncio.wait_for(task, 2)
    assert [(m["type"], m["payload"]["code"], m["payload"]["fatal"]) for m in connection.sent] == [
        ("error", code, True)
    ]
    assert (TENANT, CALL) not in rig.store.sessions  # nothing was created


async def test_a_desktop_that_never_says_hello_is_dropped(rig: Rig) -> None:
    rig.start_timeout_seconds = 0.05
    connection, task = rig.connect()

    assert await connection.wait_for_close() == 4408
    await asyncio.wait_for(task, 2)
    assert connection.sent[0]["payload"]["code"] == "start_timeout"


async def test_someone_elses_call_is_refused_and_stays_theirs(rig: Rig) -> None:
    owner, owner_task = await rig.started()
    intruder, intruder_task = rig.connect(user_id=OTHER_USER)

    intruder.push(start_frame())

    assert await intruder.wait_for_close() == 4403
    await asyncio.wait_for(intruder_task, 2)
    assert intruder.sent[0]["payload"]["code"] == "forbidden"
    assert rig.store.sessions[(TENANT, CALL)]["user_id"] == USER
    await finish(owner, owner_task)


async def test_the_same_call_id_in_another_tenant_is_a_separate_new_session(rig: Rig) -> None:
    mine, mine_task = await rig.started()
    mine.push(final_frame(1, "Hello."))
    theirs, theirs_task = await rig.started(tenant_id=OTHER_TENANT, user_id=OTHER_USER)

    assert theirs.sent[0]["payload"] == {"resumed": False, "last_client_seq": 0}
    await finish(mine, mine_task)
    await finish(theirs, theirs_task)


async def test_a_call_that_already_ended_cannot_be_started_again(rig: Rig) -> None:
    first, first_task = await rig.started()
    first.push(frame("session.end", 1))
    await asyncio.wait_for(first_task, 2)
    second, second_task = rig.connect()

    second.push(start_frame())

    assert await second.wait_for_close() == 4409
    await asyncio.wait_for(second_task, 2)
    assert second.sent[0]["payload"]["code"] == "session_ended"


# --- numbering -----------------------------------------------------------------


async def test_each_message_is_acted_on_once_even_if_it_arrives_twice(rig: Rig) -> None:
    connection, task = await rig.started()

    for _ in range(3):
        connection.push(final_frame(1, "Is it ready?"))
    connection.push(partial_frame(2, "Yes"))
    connection.push(partial_frame(2, "Yes"))
    await rig.pipeline.wait_for_utterances(1)
    await finish(connection, task)

    assert [u.text for u in rig.pipeline.utterances] == ["Is it ready?"]
    assert rig.store.sessions[(TENANT, CALL)]["last"] == 2


async def test_a_skipped_message_closes_the_connection_so_the_desktop_resyncs(rig: Rig) -> None:
    connection, task = await rig.started()

    connection.push(final_frame(2, "Is it ready?"))  # seq 1 never arrived

    assert await connection.wait_for_close() == 4400
    await asyncio.wait_for(task, 2)
    assert connection.sent[-1]["payload"] == {
        "code": "out_of_order",
        "message": "A message was skipped. Reconnect and resend from last_client_seq.",
        "fatal": True,
    }
    assert rig.pipeline.utterances == []


async def test_a_bad_message_gets_an_error_and_the_call_goes_on(rig: Rig) -> None:
    connection, task = await rig.started()

    connection.push("{}")
    connection.push(b"binary")
    connection.push(final_frame(1, "Is it ready?"))
    await connection.wait_for_messages(3)

    codes = [p["code"] for p in payloads(connection, "error")]
    assert codes == ["invalid_message", "invalid_message"]
    assert not any(p["fatal"] for p in payloads(connection, "error"))
    assert connection.closed_with is None
    # The bad messages did not use up a number: seq 1 was still free for the real message.
    assert rig.store.sessions[(TENANT, CALL)]["last"] == 1
    await finish(connection, task)


async def test_a_message_for_another_call_is_refused_without_using_a_number(rig: Rig) -> None:
    connection, task = await rig.started()

    connection.push(frame("session.end", 1, call_id=uuid.uuid4()))
    await connection.wait_for_messages(2)

    assert payloads(connection, "error")[0]["code"] == "call_id_mismatch"
    assert rig.store.sessions[(TENANT, CALL)] == {"user_id": USER, "ended": False, "last": 0}
    await finish(connection, task)


async def test_starting_twice_is_an_error_not_a_reset(rig: Rig) -> None:
    connection, task = await rig.started()
    connection.push(final_frame(1, "Is it ready?"))

    connection.push(start_frame())
    await connection.wait_for_messages(2)

    assert payloads(connection, "error")[0]["code"] == "already_started"
    assert rig.store.sessions[(TENANT, CALL)]["last"] == 1
    await finish(connection, task)


async def test_an_oversized_message_closes_the_connection(rig: Rig) -> None:
    connection, task = await rig.started()

    connection.push(final_frame(1, "x" * 5000))

    assert await connection.wait_for_close() == 1009
    await asyncio.wait_for(task, 2)
    assert payloads(connection, "error")[-1]["code"] == "message_too_large"
    assert rig.pipeline.utterances == []


async def test_the_size_limit_counts_bytes_not_characters(rig: Rig) -> None:
    rig.max_message_bytes = 300
    connection, task = await rig.started()
    text = "é" * 100  # 100 characters, 200 bytes
    raw = json.dumps(json.loads(final_frame(1, text)), ensure_ascii=False)
    assert len(raw) < 300 < len(raw.encode())

    connection.push(raw)

    assert await connection.wait_for_close() == 1009
    await asyncio.wait_for(task, 2)


# --- answering -----------------------------------------------------------------


async def test_a_final_utterance_is_answered_with_the_cards_events_in_order(rig: Rig) -> None:
    rig.pipeline.scripts = [CARD]
    connection, task = await rig.started()

    connection.push(final_frame(1, "How much is it?", utterance_id="q-7"))
    await connection.wait_for_messages(4)

    assert connection.types() == [
        "session.ready",
        "card.start",
        "card.delta",
        "card.end",
    ]
    assert [m["seq"] for m in connection.sent] == [1, 2, 3, 4]
    assert {m["call_id"] for m in connection.sent} == {str(CALL)}
    assert rig.pipeline.utterances == [Utterance("q-7", "customer", "How much is it?")]
    await finish(connection, task)


async def test_partial_transcripts_are_not_answered(rig: Rig) -> None:
    connection, task = await rig.started()

    connection.push(partial_frame(1, "How much is"))
    await finish(connection, task)

    assert rig.pipeline.utterances == []


async def test_questions_are_answered_one_at_a_time_in_the_order_asked(rig: Rig) -> None:
    gate = asyncio.Event()
    rig.pipeline.gate = gate
    connection, task = await rig.started()

    connection.push(final_frame(1, "First?", utterance_id="a"))
    connection.push(final_frame(2, "Second?", utterance_id="b"))
    await rig.pipeline.wait_for_utterances(1)
    await asyncio.sleep(0.05)  # long enough for a (wrongly) concurrent second answer to show

    assert [u.utterance_id for u in rig.pipeline.utterances] == ["a"]  # b waits for a
    gate.set()
    await rig.pipeline.wait_for_utterances(2)
    assert [u.utterance_id for u in rig.pipeline.utterances] == ["a", "b"]
    await finish(connection, task)


async def test_the_server_keeps_receiving_while_a_card_is_being_made(rig: Rig) -> None:
    rig.pipeline.gate = asyncio.Event()  # the answer never finishes
    connection, task = await rig.started()
    connection.push(final_frame(1, "How much is it?"))

    connection.push("garbage")
    await connection.wait_for_messages(2)

    assert payloads(connection, "error")[0]["code"] == "invalid_message"
    await finish(connection, task)


async def test_messages_from_the_card_and_from_errors_never_share_a_number(rig: Rig) -> None:
    class Chatty:
        async def answer(self, utterance: Utterance, emit: EmitCardEvent) -> None:
            await emit(CardStartPayload(card_id="c1", utterance_id=utterance.utterance_id))
            for index in range(40):
                await emit(CardDeltaPayload(card_id="c1", text=f"{index} "))
                await asyncio.sleep(0)
            await emit(CardEndPayload(card_id="c1", status="complete"))

    rig.pipeline = Chatty()
    connection, task = await rig.started()
    connection.push(final_frame(1, "Is it ready?"))
    for _ in range(20):
        connection.push("garbage")
        await asyncio.sleep(0)
    await connection.wait_for_messages(1 + 42 + 20)

    assert [m["seq"] for m in connection.sent] == list(range(1, 64))
    await finish(connection, task)


async def test_a_pipeline_that_breaks_does_not_end_the_call(rig: Rig) -> None:
    rig.pipeline.error = RuntimeError("secret detail that must not be logged")
    connection, task = await rig.started()

    with structlog.testing.capture_logs() as logs:
        connection.push(final_frame(1, "Is it ready?"))
        await rig.pipeline.wait_for_utterances(1)
        connection.push(partial_frame(2, "Still here"))
        connection.push(frame("card.feedback", 3, {"card_id": "c1", "rating": "helpful"}))
        await finish(connection, task)

    assert rig.store.sessions[(TENANT, CALL)]["last"] == 3
    failure = next(entry for entry in logs if entry["event"] == "calls.live.pipeline_error")
    assert failure["error"] == "RuntimeError"
    assert "secret detail" not in repr(logs)


async def test_card_feedback_is_logged_by_id_and_rating(rig: Rig) -> None:
    connection, task = await rig.started()

    with structlog.testing.capture_logs() as logs:
        connection.push(frame("card.feedback", 1, {"card_id": "c1", "rating": "not_helpful"}))
        await finish(connection, task)

    feedback = next(entry for entry in logs if entry["event"] == "calls.live.card_feedback")
    assert (feedback["card_id"], feedback["rating"]) == ("c1", "not_helpful")


# --- ending, leaving, resuming ---------------------------------------------------


async def test_session_end_closes_the_connection_and_marks_the_call_ended(rig: Rig) -> None:
    connection, task = await rig.started()

    connection.push(frame("session.end", 1))

    assert await connection.wait_for_close() == 1000
    await asyncio.wait_for(task, 2)
    assert rig.store.sessions[(TENANT, CALL)]["ended"] is True
    assert connection.types() == ["session.ready"]


async def test_ending_the_call_mid_card_tells_the_desktop_the_card_was_cancelled(
    rig: Rig,
) -> None:
    class StopsHalfWay:
        async def answer(self, utterance: Utterance, emit: EmitCardEvent) -> None:
            await emit(CardStartPayload(card_id="c9", utterance_id=utterance.utterance_id))
            await asyncio.Event().wait()

    rig.pipeline = StopsHalfWay()
    connection, task = await rig.started()
    connection.push(final_frame(1, "Is it ready?"))
    await connection.wait_for_messages(2)

    connection.push(frame("session.end", 2))

    assert await connection.wait_for_close() == 1000
    await asyncio.wait_for(task, 2)
    assert connection.types() == ["session.ready", "card.start", "card.end"]
    assert connection.sent[-1]["payload"] == {"card_id": "c9", "status": "cancelled"}


async def test_a_dropped_connection_stops_the_work_but_keeps_the_call_resumable(
    rig: Rig,
) -> None:
    cancelled = asyncio.Event()
    started = asyncio.Event()

    class Slow:
        async def answer(self, utterance: Utterance, emit: EmitCardEvent) -> None:
            started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancelled.set()
                raise

    rig.pipeline = Slow()
    connection, task = await rig.started()
    connection.push(final_frame(1, "Is it ready?"))
    await started.wait()

    await finish(connection, task)

    assert cancelled.is_set()
    assert rig.store.sessions[(TENANT, CALL)]["ended"] is False


async def test_a_desktop_that_comes_back_resumes_where_the_server_got_to(rig: Rig) -> None:
    rig.pipeline.scripts = [CARD]
    first, first_task = await rig.started()
    first.push(final_frame(1, "How much is it?"))
    first.push(partial_frame(2, "Yes"))
    await first.wait_for_messages(4)
    await finish(first, first_task)

    second, second_task = rig.connect()
    second.push(start_frame())
    await second.wait_for_messages(1)

    assert second.sent[0] == {
        "v": 1,
        "type": "session.ready",
        "call_id": str(CALL),
        "seq": 1,  # the server's numbering restarts with each connection
        "payload": {"resumed": True, "last_client_seq": 2},
    }
    # The desktop re-sends what it is unsure about (2) and carries on (3).
    second.push(partial_frame(2, "Yes"))
    second.push(final_frame(3, "And support?", utterance_id="u3"))
    await rig.pipeline.wait_for_utterances(2)
    await finish(second, second_task)
    assert [u.utterance_id for u in rig.pipeline.utterances] == ["u1", "u3"]
    assert rig.store.sessions[(TENANT, CALL)]["last"] == 3


async def test_a_final_re_sent_after_a_reconnect_is_not_answered_twice(rig: Rig) -> None:
    first, first_task = await rig.started()
    first.push(final_frame(1, "Is it ready?"))
    await rig.pipeline.wait_for_utterances(1)
    await finish(first, first_task)

    second, second_task = await rig.started()
    second.push(final_frame(1, "Is it ready?"))
    await asyncio.sleep(0.05)  # long enough for a (wrongly) repeated answer to show
    await finish(second, second_task)

    assert len(rig.pipeline.utterances) == 1


# --- when things break -------------------------------------------------------------


async def test_a_store_that_is_down_at_the_start_closes_with_unavailable(rig: Rig) -> None:
    rig.store.unavailable = True
    connection, task = rig.connect()

    connection.push(start_frame())

    assert await connection.wait_for_close() == 1011
    await asyncio.wait_for(task, 2)
    assert connection.sent[0]["payload"]["code"] == "unavailable"
    assert connection.sent[0]["payload"]["fatal"] is True


async def test_a_store_that_goes_down_mid_call_closes_with_unavailable(rig: Rig) -> None:
    connection, task = await rig.started()
    rig.store.unavailable = True

    connection.push(final_frame(1, "Is it ready?"))

    assert await connection.wait_for_close() == 1011
    await asyncio.wait_for(task, 2)
    assert payloads(connection, "error")[-1]["code"] == "unavailable"


async def test_a_session_that_expired_while_connected_is_reported(rig: Rig) -> None:
    connection, task = await rig.started()
    rig.store.expire(TENANT, CALL)

    connection.push(final_frame(1, "Is it ready?"))

    assert await connection.wait_for_close() == 4409
    await asyncio.wait_for(task, 2)
    assert payloads(connection, "error")[-1]["code"] == "session_expired"


async def test_a_vanished_desktop_never_surfaces_as_an_error(rig: Rig) -> None:
    connection, task = rig.connect()
    connection.disconnect()

    await asyncio.wait_for(task, 2)  # run() returned normally

    assert task.exception() is None


async def test_nothing_the_desktop_says_ends_up_in_the_logs(rig: Rig) -> None:
    secret = "my-secret-call-content"
    rig.pipeline.scripts = [CARD]
    with structlog.testing.capture_logs() as logs:
        connection, task = await rig.started()
        connection.push(final_frame(1, f"{secret} is it ready?", utterance_id="u-log"))
        connection.push(partial_frame(2, secret))
        connection.push(f'{{"type": "{secret}"}}')
        connection.push(frame("card.feedback", 3, {"card_id": "c1", "rating": "helpful"}))
        await connection.wait_for_messages(5)
        await finish(connection, task)

    assert secret not in repr(logs)
    closed = next(entry for entry in logs if entry["event"] == "calls.live.session_closed")
    assert (closed["finals"], closed["partials"], closed["feedback"], closed["cards"]) == (
        1,
        1,
        1,
        1,
    )
    assert closed["reason"] == "disconnected"


async def test_the_error_messages_the_desktop_sees_never_repeat_what_it_sent(rig: Rig) -> None:
    secret = "my-secret-call-content"
    connection, task = await rig.started()

    connection.push(f'{{"type": "{secret}", "call_id": "{secret}"}}')
    await connection.wait_for_messages(2)

    assert secret not in repr(connection.sent)
    await finish(connection, task)
