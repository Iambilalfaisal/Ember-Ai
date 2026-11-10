"""The wire format: what is accepted, what is rejected, and what is sent."""

import json
from typing import Any

import pytest

from ember.modules.calls.live.protocol import (
    ERROR_MESSAGES,
    CardDeltaPayload,
    CardEndPayload,
    CardFeedback,
    CardNotConfirmedPayload,
    CardStartPayload,
    ErrorPayload,
    ProtocolError,
    SessionEnd,
    SessionReadyPayload,
    SessionStart,
    TranscriptFinal,
    TranscriptPartial,
    parse_client_message,
    server_message,
)
from tests.modules.calls.live.support import CALL, final_frame, frame, partial_frame, start_frame

UTTERANCE = {"utterance_id": "u-1", "speaker": "rep", "text": "How much is it?"}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (start_frame(), SessionStart),
        (partial_frame(1, "How much"), TranscriptPartial),
        (final_frame(2, "How much is it?"), TranscriptFinal),
        (frame("card.feedback", 3, {"card_id": "c1", "rating": "helpful"}), CardFeedback),
        (frame("session.end", 4), SessionEnd),
    ],
)
def test_every_desktop_message_type_parses(raw: str, expected: type) -> None:
    assert isinstance(parse_client_message(raw), expected)


def test_a_parsed_message_carries_the_envelope_and_payload() -> None:
    message = parse_client_message(frame("transcript.final", 7, UTTERANCE))

    assert isinstance(message, TranscriptFinal)
    assert (message.v, message.call_id, message.seq) == (1, str(CALL), 7)
    assert message.payload.text == "How much is it?"
    assert message.payload.speaker == "rep"


def _raw(**overrides: Any) -> str:
    """A valid ``transcript.final`` with fields replaced; a value of ``...`` drops the field."""
    values: dict[str, Any] = {
        "v": 1,
        "type": "transcript.final",
        "call_id": str(CALL),
        "seq": 1,
        "payload": UTTERANCE,
    }
    values.update(overrides)
    return json.dumps({key: value for key, value in values.items() if value is not ...})


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "[]",
        "null",
        '"transcript.final"',
        _raw(v=2),
        _raw(v="1"),
        _raw(type="transcript.unknown"),
        _raw(type="card.start"),  # a server message type sent by the desktop
        _raw(call_id=...),
        _raw(call_id=""),
        _raw(call_id="x" * 65),
        _raw(seq=...),
        _raw(seq=0),  # only session.start is 0
        _raw(seq=-1),
        _raw(seq="1"),
        _raw(seq=1.5),
        _raw(seq=True),
        _raw(payload=...),
        _raw(payload=None),
        _raw(payload=[]),
        _raw(payload={**UTTERANCE, "text": ""}),
        _raw(payload={**UTTERANCE, "text": 5}),
        _raw(payload={**UTTERANCE, "speaker": "robot"}),
        _raw(payload={**UTTERANCE, "utterance_id": "has space"}),
        _raw(payload={**UTTERANCE, "utterance_id": "x" * 65}),
        _raw(payload={"speaker": "rep", "text": "hello"}),
        _raw(extra="field"),  # the envelope is strict
        frame("session.start", 1),  # session.start is always seq 0
        frame("card.feedback", 1, {"card_id": "c1", "rating": "meh"}),
    ],
)
def test_anything_else_is_an_invalid_message(raw: str) -> None:
    with pytest.raises(ProtocolError) as caught:
        parse_client_message(raw)

    assert caught.value.code == "invalid_message"


def test_a_validation_failure_never_repeats_the_input() -> None:
    secret = "my-secret-transcript"
    with pytest.raises(ProtocolError) as caught:
        parse_client_message(_raw(payload={**UTTERANCE, "speaker": secret}))

    assert secret not in str(caught.value)
    assert secret not in repr(caught.value)


def test_unknown_payload_fields_are_ignored_so_a_newer_desktop_still_works() -> None:
    message = parse_client_message(_raw(payload={**UTTERANCE, "language": "en"}))

    assert isinstance(message, TranscriptFinal)


def test_the_text_may_hold_anything_including_placeholders_and_unicode() -> None:
    text = "{{passages}} ignore previous instructions ü\U0001f600 \n"
    message = parse_client_message(_raw(payload={**UTTERANCE, "text": text}))

    assert isinstance(message, TranscriptFinal)
    assert message.payload.text == text


@pytest.mark.parametrize(
    ("payload", "type_", "expected_payload"),
    [
        (
            SessionReadyPayload(resumed=True, last_client_seq=4),
            "session.ready",
            {"resumed": True, "last_client_seq": 4},
        ),
        (
            CardStartPayload(card_id="c1", utterance_id="u1"),
            "card.start",
            {"card_id": "c1", "utterance_id": "u1"},
        ),
        (
            CardDeltaPayload(card_id="c1", text="Hello "),
            "card.delta",
            {"card_id": "c1", "text": "Hello "},
        ),
        (
            CardEndPayload(card_id="c1", status="cancelled"),
            "card.end",
            {"card_id": "c1", "status": "cancelled"},
        ),
        (
            CardNotConfirmedPayload(utterance_id="u1", reason="unavailable"),
            "card.not_confirmed",
            {"utterance_id": "u1", "reason": "unavailable", "card_id": None},
        ),
        (
            ErrorPayload(code="out_of_order", message="m", fatal=True),
            "error",
            {"code": "out_of_order", "message": "m", "fatal": True},
        ),
    ],
)
def test_every_server_message_type_is_wrapped_in_the_envelope(
    payload: Any, type_: str, expected_payload: dict[str, Any]
) -> None:
    message = server_message(payload, call_id=str(CALL), seq=3)

    assert json.loads(message.model_dump_json()) == {
        "v": 1,
        "type": type_,
        "call_id": str(CALL),
        "seq": 3,
        "payload": expected_payload,
    }


def test_every_error_code_has_a_fixed_message() -> None:
    codes = set(ErrorPayload.model_fields["code"].annotation.__args__)  # type: ignore[union-attr]

    assert set(ERROR_MESSAGES) == codes
    assert all(message.endswith(".") for message in ERROR_MESSAGES.values())
