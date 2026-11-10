"""Fakes and helpers for the live-call tests: an in-memory store, a scripted connection."""

import asyncio
import json
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from ember.modules.calls.live.pipeline import EmitCardEvent, Utterance
from ember.modules.calls.live.protocol import CardEvent
from ember.modules.calls.live.session import ClientDisconnected, LiveRuntime, LiveSession
from ember.modules.calls.live.store import (
    Advance,
    SessionState,
    SessionStoreUnavailable,
)

TENANT = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
OTHER_TENANT = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
USER = uuid.UUID("11111111-1111-1111-1111-111111111111")
OTHER_USER = uuid.UUID("22222222-2222-2222-2222-222222222222")
CALL = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")


def frame(
    type_: str, seq: int, payload: dict[str, Any] | None = None, *, call_id: uuid.UUID = CALL
) -> str:
    """A desktop message as the JSON text frame it would send."""
    return json.dumps(
        {"v": 1, "type": type_, "call_id": str(call_id), "seq": seq, "payload": payload or {}}
    )


def start_frame(*, call_id: uuid.UUID = CALL) -> str:
    return frame("session.start", 0, call_id=call_id)


def final_frame(seq: int, text: str, *, utterance_id: str = "u1", call_id: uuid.UUID = CALL) -> str:
    return frame(
        "transcript.final",
        seq,
        {"utterance_id": utterance_id, "speaker": "customer", "text": text},
        call_id=call_id,
    )


def partial_frame(
    seq: int, text: str, *, utterance_id: str = "u1", call_id: uuid.UUID = CALL
) -> str:
    return frame(
        "transcript.partial",
        seq,
        {"utterance_id": utterance_id, "speaker": "customer", "text": text},
        call_id=call_id,
    )


class InMemorySessionStore:
    """The same rules as ``RedisSessionStore``, without Redis."""

    def __init__(self) -> None:
        self.sessions: dict[tuple[uuid.UUID, uuid.UUID], dict[str, Any]] = {}
        self.unavailable = False

    def expire(self, tenant_id: uuid.UUID, call_id: uuid.UUID) -> None:
        self.sessions.pop((tenant_id, call_id), None)

    def _check(self) -> None:
        if self.unavailable:
            raise SessionStoreUnavailable

    async def open(
        self, *, tenant_id: uuid.UUID, call_id: uuid.UUID, user_id: uuid.UUID
    ) -> SessionState:
        self._check()
        existing = self.sessions.get((tenant_id, call_id))
        if existing is None:
            self.sessions[(tenant_id, call_id)] = {"user_id": user_id, "ended": False, "last": 0}
            return SessionState(user_id=user_id, resumed=False, last_client_seq=0, ended=False)
        return SessionState(
            user_id=existing["user_id"],
            resumed=True,
            last_client_seq=existing["last"],
            ended=existing["ended"],
        )

    async def advance(self, *, tenant_id: uuid.UUID, call_id: uuid.UUID, seq: int) -> Advance:
        self._check()
        state = self.sessions.get((tenant_id, call_id))
        if state is None:
            return Advance.MISSING
        if state["ended"]:
            return Advance.ENDED
        if seq <= state["last"]:
            return Advance.DUPLICATE
        if seq != state["last"] + 1:
            return Advance.GAP
        state["last"] = seq
        return Advance.CLAIMED

    async def end(self, *, tenant_id: uuid.UUID, call_id: uuid.UUID) -> None:
        self._check()
        if (tenant_id, call_id) in self.sessions:
            self.sessions[(tenant_id, call_id)]["ended"] = True


_GONE = object()


class FakeConnection:
    """The desktop's end, driven by the test: ``push`` frames in, read ``sent`` out."""

    def __init__(self) -> None:
        self._incoming: asyncio.Queue[Any] = asyncio.Queue()
        self.sent: list[dict[str, Any]] = []
        self.closed_with: int | None = None
        self._gone = False
        self._changed = asyncio.Condition()

    def push(self, frame_: str | bytes) -> None:
        self._incoming.put_nowait(frame_)

    def disconnect(self) -> None:
        """The desktop's network drops: the session's next read fails, and so does a send."""
        self._gone = True
        self._incoming.put_nowait(_GONE)

    async def receive(self) -> str | bytes:
        item = await self._incoming.get()
        if item is _GONE:
            raise ClientDisconnected
        result: str | bytes = item
        return result

    async def send_text(self, data: str) -> None:
        if self._gone or self.closed_with is not None:
            raise ClientDisconnected
        async with self._changed:
            self.sent.append(json.loads(data))
            self._changed.notify_all()

    async def close(self, code: int) -> None:
        async with self._changed:
            self.closed_with = code
            self._changed.notify_all()

    async def wait_until(self, condition: Callable[[], bool], seconds: float = 2.0) -> None:
        async def wait() -> None:
            async with self._changed:
                await self._changed.wait_for(condition)

        await asyncio.wait_for(wait(), seconds)

    async def wait_for_messages(self, count: int, seconds: float = 2.0) -> list[dict[str, Any]]:
        await self.wait_until(lambda: len(self.sent) >= count, seconds)
        return self.sent

    async def wait_for_close(self, seconds: float = 2.0) -> int:
        await self.wait_until(lambda: self.closed_with is not None, seconds)
        assert self.closed_with is not None
        return self.closed_with

    def types(self) -> list[str]:
        return [message["type"] for message in self.sent]


@dataclass
class ScriptedPipeline:
    """Answers each utterance with the next scripted list of events (none by default)."""

    scripts: list[Sequence[CardEvent]] = field(default_factory=list)
    utterances: list[Utterance] = field(default_factory=list)
    gate: asyncio.Event | None = None
    """When set, every answer waits for it first (to keep a card 'in flight')."""
    error: Exception | None = None
    _arrived: asyncio.Condition = field(default_factory=asyncio.Condition)

    async def wait_for_utterances(self, count: int, seconds: float = 2.0) -> None:
        """Wait until the session has handed ``count`` utterances to the pipeline."""

        async def wait() -> None:
            async with self._arrived:
                await self._arrived.wait_for(lambda: len(self.utterances) >= count)

        await asyncio.wait_for(wait(), seconds)

    async def answer(self, utterance: Utterance, emit: EmitCardEvent) -> None:
        async with self._arrived:
            self.utterances.append(utterance)
            self._arrived.notify_all()
        if self.gate is not None:
            await self.gate.wait()
        if self.error is not None:
            raise self.error
        for event in self.scripts.pop(0) if self.scripts else ():
            await emit(event)


def make_runtime(
    store: InMemorySessionStore,
    pipeline: Any,
    *,
    max_message_bytes: int = 4096,
    start_timeout_seconds: float = 1.0,
) -> LiveRuntime:
    return LiveRuntime(
        store=store,
        pipeline=pipeline,
        max_message_bytes=max_message_bytes,
        start_timeout_seconds=start_timeout_seconds,
    )


def make_session(
    runtime: LiveRuntime,
    connection: FakeConnection,
    *,
    tenant_id: uuid.UUID = TENANT,
    user_id: uuid.UUID = USER,
    call_id: uuid.UUID = CALL,
) -> LiveSession:
    return LiveSession(runtime, connection, tenant_id=tenant_id, user_id=user_id, call_id=call_id)
