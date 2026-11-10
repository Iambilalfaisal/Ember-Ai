"""What happens to a finished utterance: the live pipeline.

``LivePipeline`` is the seam between the session (connection, numbering, state) and the answer
logic. A pipeline receives one utterance and *emits* card events as it goes; the session wraps
each in an envelope and sends it. Emitting through a callback, not by yielding, keeps every
``stage_timer`` span open across plain awaits instead of across generator suspensions.

:class:`FakePipeline` is the F7 skeleton: it answers any question (an utterance ending in ``?``)
with a canned answer, streamed word by word through the AI gateway, with every stage of
AGENTS.md section 6 wrapped in ``stage_timer``. It exists to prove the plumbing and the latency
budget. It uses no knowledge base and invents nothing, so it must be replaced before reps use it.
"""

import uuid
from collections.abc import Awaitable, Callable
from contextlib import aclosing
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Protocol

import structlog

from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.interface import Message
from ember.adapters.ai.prompts import PromptLibrary
from ember.core.observability import stage_timer
from ember.modules.calls.live.protocol import (
    CardDeltaPayload,
    CardEndPayload,
    CardEvent,
    CardNotConfirmedPayload,
    CardStartPayload,
    Speaker,
)

logger = structlog.get_logger(__name__)

PROMPTS_DIRECTORY: Final = Path(__file__).resolve().parent.parent / "prompts"
ANSWER_TASK: Final = "live_answer"
ANSWER_PROMPT_VERSION: Final = 1
_FAKE_PASSAGES: Final = "- This is a fake passage. The real pipeline retrieves approved documents."


@dataclass(frozen=True, slots=True)
class Utterance:
    """A finished piece of the call. ``text`` is untrusted and must never be logged."""

    utterance_id: str
    speaker: Speaker
    text: str


EmitCardEvent = Callable[[CardEvent], Awaitable[None]]
"""Sends one card event to the desktop. Raises ``ConnectionError`` if the desktop is gone."""


class LivePipeline(Protocol):
    async def answer(self, utterance: Utterance, emit: EmitCardEvent) -> None:
        """Turn ``utterance`` into card events, or into none if it needs no card.

        A pipeline must not let the panel go blank (AGENTS.md section 6): when it cannot answer
        it emits ``card.not_confirmed``. Errors from ``emit`` (a lost connection) are not the
        pipeline's to handle and propagate.
        """
        ...


class FakePipeline:
    """Stages ``detect`` -> ``rewrite`` -> ``retrieve`` -> ``generate`` with fake logic."""

    def __init__(self, gateway: AiGateway, prompts: PromptLibrary | None = None) -> None:
        self._gateway = gateway
        library = prompts or PromptLibrary(PROMPTS_DIRECTORY)
        # Loaded now, so a missing prompt file stops the service at startup.
        self._prompt = library.load(ANSWER_TASK, version=ANSWER_PROMPT_VERSION)

    async def answer(self, utterance: Utterance, emit: EmitCardEvent) -> None:
        with stage_timer("detect"):
            is_question = utterance.text.rstrip().endswith("?")
        if not is_question:
            return
        with stage_timer("rewrite"):
            # The real stage resolves "it" and "that" from earlier turns. Here: tidy whitespace.
            question = " ".join(utterance.text.split())
        with stage_timer("retrieve"):
            passages = _FAKE_PASSAGES

        messages = [
            Message("system", self._prompt.render(passages=passages)),
            Message("user", question),
        ]
        card_id = uuid.uuid4().hex
        started = False
        pieces = 0
        try:
            with stage_timer("generate_total"):
                stream = self._gateway.stream(
                    task=ANSWER_TASK, messages=messages, prompt=self._prompt.ref
                )
                async with aclosing(stream):
                    with stage_timer("generate_first_token"):
                        first = await anext(stream, None)
                    if first is None:
                        raise LookupError("the model returned no text")
                    # The card starts with its first text, so a failure before that is one
                    # clean ``card.not_confirmed`` and never a started card with no content.
                    started = True
                    await emit(
                        CardStartPayload(card_id=card_id, utterance_id=utterance.utterance_id)
                    )
                    await emit(CardDeltaPayload(card_id=card_id, text=first))
                    pieces = 1
                    async for piece in stream:
                        await emit(CardDeltaPayload(card_id=card_id, text=piece))
                        pieces += 1
            await emit(CardEndPayload(card_id=card_id, status="complete"))
        except ConnectionError:
            raise
        except Exception as exc:
            # A vendor error, a timeout or a bug: either way the rep gets an answer, not a blank
            # panel. Only the error class is logged; its message could contain call content.
            logger.warning(
                "calls.live.card_failed",
                error=type(exc).__name__,
                utterance_id=utterance.utterance_id,
                card_started=started,
                pieces=pieces,
            )
            await emit(
                CardNotConfirmedPayload(
                    utterance_id=utterance.utterance_id,
                    reason="unavailable",
                    card_id=card_id if started else None,
                )
            )
