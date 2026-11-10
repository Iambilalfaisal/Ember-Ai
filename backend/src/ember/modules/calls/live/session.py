"""One desktop connection to one live call.

:class:`LiveSession` owns the life of a connection: the ``session.start`` handshake, numbering
and duplicate handling, handing finished utterances to the pipeline, and the way out (the call
ended, the desktop left, something broke). It talks to the desktop through the small
:class:`Connection` interface, so it runs the same under Starlette and in tests.

A connection that drops leaves the call's state in Redis, so the desktop can reconnect to the
same ``call_id`` and carry on (:mod:`ember.modules.calls.live.store`). Each desktop message is
accepted at most once: the server claims its number *before* acting on it, so a crash between the
two loses a message rather than answering a question twice. For a live card that is the right
trade: an answer that arrives late is worse than none.

Utterances are answered one at a time, in order, by a worker task, so receiving stays responsive
while a card streams. A question that arrives meanwhile waits its turn.
"""

import asyncio
import time
import uuid
from contextlib import suppress
from dataclasses import dataclass
from typing import NoReturn, Protocol

import structlog

from ember.modules.calls.live.pipeline import LivePipeline, Utterance
from ember.modules.calls.live.protocol import (
    CLOSE_CONFLICT,
    CLOSE_FORBIDDEN,
    CLOSE_INTERNAL,
    CLOSE_NORMAL,
    CLOSE_PROTOCOL,
    CLOSE_TIMEOUT,
    CLOSE_TOO_LARGE,
    ERROR_MESSAGES,
    CardDeltaPayload,
    CardEndPayload,
    CardEvent,
    CardFeedback,
    CardNotConfirmedPayload,
    CardStartPayload,
    ClientMessage,
    ErrorCode,
    ErrorPayload,
    Payload,
    ProtocolError,
    SessionEnd,
    SessionReadyPayload,
    SessionStart,
    TranscriptFinal,
    TranscriptPartial,
    parse_client_message,
    server_message,
)
from ember.modules.calls.live.store import Advance, SessionStore, SessionStoreUnavailable

logger = structlog.get_logger(__name__)


class ClientDisconnected(ConnectionError):
    """The desktop closed the connection, or it broke."""


class Connection(Protocol):
    """The desktop's end of the WebSocket, as the session needs it."""

    async def receive(self) -> str | bytes:
        """The next frame. Raises :class:`ClientDisconnected` when the connection is gone."""
        ...

    async def send_text(self, data: str) -> None:
        """Send one text frame. Raises :class:`ClientDisconnected` when the connection is gone."""
        ...

    async def close(self, code: int) -> None: ...


@dataclass(frozen=True, slots=True)
class LiveRuntime:
    """What every session of this process shares."""

    store: SessionStore
    pipeline: LivePipeline
    max_message_bytes: int
    start_timeout_seconds: float


class _SessionOver(Exception):
    """Raised to leave ``run`` after the connection has been dealt with."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class LiveSession:
    def __init__(
        self,
        runtime: LiveRuntime,
        connection: Connection,
        *,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        call_id: uuid.UUID,
    ) -> None:
        self._runtime = runtime
        self._connection = connection
        self._tenant_id = tenant_id
        self._user_id = user_id
        self._call_id = call_id
        self._call_id_text = str(call_id)
        self._server_seq = 0
        self._send_lock = asyncio.Lock()
        self._utterances: asyncio.Queue[Utterance] = asyncio.Queue()
        self._worker: asyncio.Task[None] | None = None
        self._open_card: str | None = None
        self._counts = {"partials": 0, "finals": 0, "cards": 0, "feedback": 0, "duplicates": 0}

    async def run(self) -> None:
        """Serve the connection until the call ends, the desktop leaves or something breaks.

        Never raises for the desktop's behaviour: protocol problems are reported to it as
        ``error`` messages. Must run with the tenant set (the gateway records usage against it).
        """
        started = time.perf_counter()
        reason = "disconnected"
        try:
            resumed = await self._handshake()
            logger.info("calls.live.session_started", resumed=resumed)
            self._worker = asyncio.create_task(self._work())
            while True:
                await self._handle(await self._connection.receive())
        except _SessionOver as over:
            reason = over.reason
        except ClientDisconnected:
            pass
        except SessionStoreUnavailable:
            logger.warning("calls.live.store_unavailable")
            reason = "store_unavailable"
            await self._close_with_error("unavailable", CLOSE_INTERNAL)
        finally:
            await self._stop_worker()
            logger.info(
                "calls.live.session_closed",
                reason=reason,
                duration_ms=round((time.perf_counter() - started) * 1000),
                **self._counts,
            )

    # --- handshake -------------------------------------------------------------

    async def _handshake(self) -> bool:
        """Wait for ``session.start``, open (or resume) the session and answer ``session.ready``.

        Returns whether this resumed an existing session.
        """
        try:
            async with asyncio.timeout(self._runtime.start_timeout_seconds):
                frame = await self._connection.receive()
        except TimeoutError:
            await self._fatal("start_timeout", CLOSE_TIMEOUT, reason="start_timeout")
        try:
            message = self._decode(frame)
        except ProtocolError as error:
            await self._fatal(error.code, _close_code_for(error.code), reason=error.code)
        if not isinstance(message, SessionStart):
            await self._fatal("session_not_started", CLOSE_PROTOCOL, reason="session_not_started")
        if message.call_id != self._call_id_text:
            await self._fatal("call_id_mismatch", CLOSE_PROTOCOL, reason="call_id_mismatch")

        state = await self._runtime.store.open(
            tenant_id=self._tenant_id, call_id=self._call_id, user_id=self._user_id
        )
        if state.user_id != self._user_id:
            await self._fatal("forbidden", CLOSE_FORBIDDEN, reason="forbidden")
        if state.ended:
            await self._fatal("session_ended", CLOSE_CONFLICT, reason="session_ended")
        await self._send(
            SessionReadyPayload(resumed=state.resumed, last_client_seq=state.last_client_seq)
        )
        return state.resumed

    # --- one message -----------------------------------------------------------

    async def _handle(self, frame: str | bytes) -> None:
        try:
            message = self._decode(frame)
        except ProtocolError as error:
            if error.code == "message_too_large":
                await self._fatal(error.code, CLOSE_TOO_LARGE, reason=error.code)
            await self._send_error(error.code, fatal=False)
            return
        if isinstance(message, SessionStart):
            await self._send_error("already_started", fatal=False)
            return
        if message.call_id != self._call_id_text:
            await self._send_error("call_id_mismatch", fatal=False)
            return

        result = await self._runtime.store.advance(
            tenant_id=self._tenant_id, call_id=self._call_id, seq=message.seq
        )
        match result:
            case Advance.DUPLICATE:
                self._counts["duplicates"] += 1
                return
            case Advance.GAP:
                await self._fatal("out_of_order", CLOSE_PROTOCOL, reason="out_of_order")
            case Advance.ENDED:
                await self._fatal("session_ended", CLOSE_CONFLICT, reason="session_ended")
            case Advance.MISSING:
                await self._fatal("session_expired", CLOSE_CONFLICT, reason="session_expired")
            case Advance.CLAIMED:
                pass
        await self._dispatch(message)

    async def _dispatch(
        self, message: TranscriptPartial | TranscriptFinal | CardFeedback | SessionEnd
    ) -> None:
        match message:
            case TranscriptPartial():
                self._counts["partials"] += 1
            case TranscriptFinal():
                self._counts["finals"] += 1
                payload = message.payload
                self._utterances.put_nowait(
                    Utterance(payload.utterance_id, payload.speaker, payload.text)
                )
            case CardFeedback():
                self._counts["feedback"] += 1
                logger.info(
                    "calls.live.card_feedback",
                    card_id=message.payload.card_id,
                    rating=message.payload.rating,
                )
            case SessionEnd():
                await self._runtime.store.end(tenant_id=self._tenant_id, call_id=self._call_id)
                await self._stop_worker(announce=True)
                await self._close(CLOSE_NORMAL)
                raise _SessionOver("ended")

    def _decode(self, frame: str | bytes) -> ClientMessage:
        if isinstance(frame, bytes):
            raise ProtocolError("invalid_message")
        limit = self._runtime.max_message_bytes
        if len(frame) > limit or len(frame.encode()) > limit:
            raise ProtocolError("message_too_large")
        return parse_client_message(frame)

    # --- answering -------------------------------------------------------------

    async def _work(self) -> None:
        """Answer utterances one at a time. A failed answer never ends the call."""
        while True:
            utterance = await self._utterances.get()
            try:
                await self._runtime.pipeline.answer(utterance, self._emit)
            except ConnectionError:
                return  # the desktop is gone; ``run`` is already winding down
            except Exception as exc:
                logger.error("calls.live.pipeline_error", error=type(exc).__name__)

    async def _emit(self, event: CardEvent) -> None:
        match event:
            case CardStartPayload():
                self._open_card = event.card_id
                self._counts["cards"] += 1
            case CardEndPayload() | CardNotConfirmedPayload():
                self._open_card = None
            case CardDeltaPayload():
                pass
        await self._send(event)

    async def _stop_worker(self, *, announce: bool = False) -> None:
        """Stop answering. With ``announce``, tell the desktop a half-sent card was cancelled."""
        worker, self._worker = self._worker, None
        if worker is not None:
            worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)
        if announce and self._open_card is not None:
            card_id, self._open_card = self._open_card, None
            await self._send(CardEndPayload(card_id=card_id, status="cancelled"))

    # --- sending ---------------------------------------------------------------

    async def _send(self, payload: Payload) -> None:
        # Number and send under one lock, so messages from the worker and from the receive loop
        # leave in the order they were numbered.
        async with self._send_lock:
            self._server_seq += 1
            message = server_message(payload, call_id=self._call_id_text, seq=self._server_seq)
            await self._connection.send_text(message.model_dump_json())

    async def _send_error(self, code: ErrorCode, *, fatal: bool) -> None:
        await self._send(ErrorPayload(code=code, message=ERROR_MESSAGES[code], fatal=fatal))

    async def _close(self, code: int) -> None:
        with suppress(ConnectionError):
            await self._connection.close(code)

    async def _close_with_error(self, code: ErrorCode, close_code: int) -> None:
        """Tell the desktop why, then close. Neither step matters if the desktop is already gone."""
        try:
            await self._send_error(code, fatal=True)
        except ConnectionError:
            return
        await self._close(close_code)

    async def _fatal(self, code: ErrorCode, close_code: int, *, reason: str) -> NoReturn:
        await self._close_with_error(code, close_code)
        raise _SessionOver(reason)


def _close_code_for(code: ErrorCode) -> int:
    return CLOSE_TOO_LARGE if code == "message_too_large" else CLOSE_PROTOCOL
