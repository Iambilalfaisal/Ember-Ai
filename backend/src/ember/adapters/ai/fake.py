"""A scripted AI provider for tests and local runs without a vendor key.

It answers instantly and deterministically, counts tokens as whitespace-separated words, and can
be told to fail or hang so the gateway's fallback, timeout and cancellation paths can be tested::

    provider = FakeAiProvider(reply="Pricing starts at 10 dollars.")
    provider.fail_next(AiProviderError())             # the next call fails
    provider.fail_next(AiProviderError(), after_chunks=2)   # a stream fails after two chunks
    provider.hang_next()                              # the next call never answers
"""

import asyncio
import hashlib
import math
from collections import deque
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass

from ember.adapters.ai.interface import (
    ChatChunk,
    ChatRequest,
    ChatResult,
    EmbedRequest,
    EmbedResult,
    TokenUsage,
)
from ember.adapters.ai.usage import UsageRecord


class InMemoryUsageRecorder:
    """Keeps usage records in a list instead of the database."""

    def __init__(self) -> None:
        self.records: list[UsageRecord] = []

    async def record(self, usage: UsageRecord) -> None:
        self.records.append(usage)


@dataclass(frozen=True, slots=True)
class _Fault:
    error: Exception | None
    """The error to raise, or ``None`` to hang until cancelled."""
    after_chunks: int


class FakeAiProvider:
    def __init__(
        self,
        *,
        reply: str = "This is a fake answer.",
        chunks: Sequence[str] | None = None,
        dimensions: int = 8,
    ) -> None:
        self.reply = reply
        self._chunks = tuple(chunks) if chunks is not None else None
        self.dimensions = dimensions
        self.chat_requests: list[ChatRequest] = []
        self.embed_requests: list[EmbedRequest] = []
        self.closed = False
        self._faults: deque[_Fault] = deque()

    def fail_next(self, error: Exception, *, after_chunks: int = 0) -> None:
        """Make the next call raise ``error`` (a stream: after yielding ``after_chunks`` chunks)."""
        self._faults.append(_Fault(error, after_chunks))

    def hang_next(self, *, after_chunks: int = 0) -> None:
        """Make the next call wait forever, as a stalled vendor would."""
        self._faults.append(_Fault(None, after_chunks))

    # --- AiProvider ------------------------------------------------------------

    async def complete(self, request: ChatRequest) -> ChatResult:
        self.chat_requests.append(request)
        await self._maybe_fail()
        return ChatResult(text=self.reply, usage=self._usage(request, self.reply))

    async def stream(self, request: ChatRequest) -> AsyncIterator[ChatChunk]:
        self.chat_requests.append(request)
        fault = self._faults.popleft() if self._faults else None
        pieces = self._pieces()
        for index, piece in enumerate(pieces):
            if fault is not None and index == fault.after_chunks:
                await self._raise(fault)
            yield ChatChunk(text=piece)
        if fault is not None and fault.after_chunks >= len(pieces):
            await self._raise(fault)
        yield ChatChunk(usage=self._usage(request, "".join(pieces)))

    async def embed(self, request: EmbedRequest) -> EmbedResult:
        self.embed_requests.append(request)
        await self._maybe_fail()
        vectors = [self._vector(text) for text in request.texts]
        tokens = sum(len(text.split()) for text in request.texts)
        return EmbedResult(vectors=vectors, usage=TokenUsage(input_tokens=tokens))

    async def aclose(self) -> None:
        self.closed = True

    # --- helpers ---------------------------------------------------------------

    def _pieces(self) -> tuple[str, ...]:
        if self._chunks is not None:
            return self._chunks
        words = self.reply.split(" ")
        return (*(word + " " for word in words[:-1]), words[-1])

    @staticmethod
    def _usage(request: ChatRequest, text: str) -> TokenUsage:
        prompt_words = sum(len(message.content.split()) for message in request.messages)
        return TokenUsage(input_tokens=prompt_words, output_tokens=len(text.split()))

    async def _maybe_fail(self) -> None:
        """Whole-call faults (``complete``, ``embed``): ``after_chunks`` does not apply."""
        if self._faults:
            await self._raise(self._faults.popleft())

    @staticmethod
    async def _raise(fault: _Fault) -> None:
        if fault.error is None:
            await asyncio.Event().wait()
        else:
            raise fault.error

    def _vector(self, text: str) -> list[float]:
        """A deterministic unit vector, so equal texts embed equally."""
        digest = hashlib.sha256(text.encode()).digest()
        values = [digest[i % len(digest)] - 127.5 for i in range(self.dimensions)]
        norm = math.sqrt(sum(value * value for value in values))
        return [value / norm for value in values]
