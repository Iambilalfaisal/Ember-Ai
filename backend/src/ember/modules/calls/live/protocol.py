"""The live-call WebSocket protocol (AGENTS.md section 6).

Every message, in both directions, is one JSON text frame in this envelope::

    { "v": 1, "type": "<type>", "call_id": "<uuid>", "seq": <int>, "payload": { ... } }

Desktop -> server:

=====================  ==================================================================
``session.start``      First message of every connection. ``seq`` is always 0.
``transcript.partial`` A transcript still being spoken (advisory).
``transcript.final``   A finished utterance. A question that ends in ``?`` gets a card.
``card.feedback``      The rep rated a card.
``session.end``        The call is over. The server closes the connection afterwards.
=====================  ==================================================================

Server -> desktop:

=======================  ================================================================
``session.ready``        Answer to ``session.start``: new or resumed, and how far the server got.
``card.start``           A card begins (sent with its first piece of text).
``card.delta``           The next piece of the card's text.
``card.end``             The card is finished, or was cancelled.
``card.not_confirmed``   Nothing reliable can be shown for this question (never a blank panel).
``error``                Something is wrong with the connection or a message.
=======================  ================================================================

Numbering. The desktop numbers its messages 1, 2, 3 ... for the whole call, **across
reconnects**: the server accepts each number once, in order. A repeat is ignored and a jump
closes the connection with ``out_of_order``. After a reconnect, ``session.ready`` says
``last_client_seq`` (the last message the server accepted), and the desktop re-sends everything
after it. The server numbers its own messages 1, 2, 3 ... **per connection** (``session.ready``
is 1) and never replays them: a card cut off by a disconnect is gone, and the next question
gets a new one.

Transcript text is untrusted input. It is data, never instructions, and it is never logged.
"""

from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

PROTOCOL_VERSION: Final = 1

# WebSocket close codes. 1xxx are the standard ones; 4xxx are Ember's own.
CLOSE_NORMAL: Final = 1000
CLOSE_TOO_LARGE: Final = 1009
CLOSE_INTERNAL: Final = 1011
CLOSE_PROTOCOL: Final = 4400
CLOSE_UNAUTHORIZED: Final = 4401
CLOSE_FORBIDDEN: Final = 4403
CLOSE_TIMEOUT: Final = 4408
CLOSE_CONFLICT: Final = 4409

ID_PATTERN: Final = r"^[A-Za-z0-9._-]{1,64}$"
"""Client-chosen ids (an utterance, a card) are short and plain: safe to log and to echo back."""

Speaker = Literal["rep", "customer", "unknown"]
Rating = Literal["helpful", "not_helpful"]
CardEndStatus = Literal["complete", "cancelled"]
NotConfirmedReason = Literal["low_confidence", "unavailable"]
ErrorCode = Literal[
    "invalid_message",
    "session_not_started",
    "already_started",
    "call_id_mismatch",
    "out_of_order",
    "message_too_large",
    "session_ended",
    "session_expired",
    "forbidden",
    "start_timeout",
    "unavailable",
]


class Payload(BaseModel):
    """Payloads ignore unknown fields, so a newer desktop can add one without breaking v1."""

    model_config = ConfigDict(extra="ignore", strict=True, frozen=True)


class Envelope(BaseModel):
    """Envelopes are strict: changing one needs a new protocol version."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    v: Literal[1] = PROTOCOL_VERSION
    call_id: str = Field(min_length=1, max_length=64)


# --- desktop -> server ----------------------------------------------------------


class ClientEnvelope(Envelope):
    seq: int = Field(ge=1)


class SessionStartPayload(Payload):
    """Empty for now. Account context and similar arrive here when the live pipeline needs them."""


class SessionStart(ClientEnvelope):
    type: Literal["session.start"] = "session.start"
    seq: Literal[0] = 0  # not part of the numbering
    payload: SessionStartPayload = SessionStartPayload()


class UtterancePayload(Payload):
    utterance_id: str = Field(pattern=ID_PATTERN)
    speaker: Speaker
    text: str = Field(min_length=1)


class TranscriptPartial(ClientEnvelope):
    type: Literal["transcript.partial"] = "transcript.partial"
    payload: UtterancePayload


class TranscriptFinal(ClientEnvelope):
    type: Literal["transcript.final"] = "transcript.final"
    payload: UtterancePayload


class CardFeedbackPayload(Payload):
    card_id: str = Field(pattern=ID_PATTERN)
    rating: Rating


class CardFeedback(ClientEnvelope):
    type: Literal["card.feedback"] = "card.feedback"
    payload: CardFeedbackPayload


class SessionEndPayload(Payload):
    pass


class SessionEnd(ClientEnvelope):
    type: Literal["session.end"] = "session.end"
    payload: SessionEndPayload = SessionEndPayload()


ClientMessage = SessionStart | TranscriptPartial | TranscriptFinal | CardFeedback | SessionEnd
_client_message_adapter: TypeAdapter[ClientMessage] = TypeAdapter(
    Annotated[ClientMessage, Field(discriminator="type")]
)


# --- server -> desktop ----------------------------------------------------------


class ServerEnvelope(Envelope):
    seq: int = Field(ge=1)


class SessionReadyPayload(Payload):
    resumed: bool
    """``True`` when this call already had a session (a reconnect)."""
    last_client_seq: int = Field(ge=0)
    """The last message the server accepted; the desktop re-sends everything after it."""


class SessionReady(ServerEnvelope):
    type: Literal["session.ready"] = "session.ready"
    payload: SessionReadyPayload


class CardStartPayload(Payload):
    card_id: str
    utterance_id: str


class CardStart(ServerEnvelope):
    type: Literal["card.start"] = "card.start"
    payload: CardStartPayload


class CardDeltaPayload(Payload):
    card_id: str
    text: str


class CardDelta(ServerEnvelope):
    type: Literal["card.delta"] = "card.delta"
    payload: CardDeltaPayload


class CardEndPayload(Payload):
    card_id: str
    status: CardEndStatus
    """``cancelled``: a newer question replaced this card, or the call ended."""


class CardEnd(ServerEnvelope):
    type: Literal["card.end"] = "card.end"
    payload: CardEndPayload


class CardNotConfirmedPayload(Payload):
    utterance_id: str
    reason: NotConfirmedReason
    card_id: str | None = None
    """Set when text of a card was already sent: the desktop replaces that card."""


class CardNotConfirmed(ServerEnvelope):
    type: Literal["card.not_confirmed"] = "card.not_confirmed"
    payload: CardNotConfirmedPayload


class ErrorPayload(Payload):
    code: ErrorCode
    message: str
    """Fixed text per code. It never repeats what the desktop sent."""
    fatal: bool
    """``True``: the server closes the connection right after this message."""


class Error(ServerEnvelope):
    type: Literal["error"] = "error"
    payload: ErrorPayload


ServerMessage = SessionReady | CardStart | CardDelta | CardEnd | CardNotConfirmed | Error

CardEvent = CardStartPayload | CardDeltaPayload | CardEndPayload | CardNotConfirmedPayload
"""What a pipeline emits for one question; the session wraps each in an envelope."""

ERROR_MESSAGES: Final[dict[str, str]] = {
    "invalid_message": "The message is not a valid protocol message.",
    "session_not_started": "Send session.start first.",
    "already_started": "The session is already started.",
    "call_id_mismatch": "The message is for a different call.",
    "out_of_order": "A message was skipped. Reconnect and resend from last_client_seq.",
    "message_too_large": "The message is too large.",
    "session_ended": "This call has ended.",
    "session_expired": "This session expired. Start a new call.",
    "forbidden": "This call belongs to another user.",
    "start_timeout": "session.start was not received in time.",
    "unavailable": "The service is temporarily unavailable. Reconnect shortly.",
}


class ProtocolError(Exception):
    """A message could not be accepted. ``code`` is what the desktop is told."""

    def __init__(self, code: ErrorCode) -> None:
        super().__init__(code)
        self.code = code


def parse_client_message(raw: str) -> ClientMessage:
    """Parse and validate one frame from the desktop.

    Raises:
        ProtocolError: ``invalid_message`` for anything that is not a valid message. The reason is
            deliberately not reported: a validation error would repeat the (private) input.
    """
    try:
        return _client_message_adapter.validate_json(raw)
    except ValidationError as exc:
        raise ProtocolError("invalid_message") from exc


_SERVER_MESSAGES: Final[dict[type[Payload], type[ServerMessage]]] = {
    SessionReadyPayload: SessionReady,
    CardStartPayload: CardStart,
    CardDeltaPayload: CardDelta,
    CardEndPayload: CardEnd,
    CardNotConfirmedPayload: CardNotConfirmed,
    ErrorPayload: Error,
}


def server_message(payload: Payload, *, call_id: str, seq: int) -> ServerMessage:
    """Wrap a server payload in its envelope.

    Raises:
        KeyError: ``payload`` is not a server payload (a programming error).
    """
    message_class = _SERVER_MESSAGES[type(payload)]
    return message_class.model_validate({"call_id": call_id, "seq": seq, "payload": payload})
