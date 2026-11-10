"""A fake AI provider that reads: it answers with the sentence of the passages that best matches.

It stands in for the model, so the whole path (retrieve, prompt, gateway, stream, score) runs
offline and gives the same result every time. Because it only quotes the passages it is given, a
wrong score here points at the search or the harness, never at a model.
"""

import re
from collections.abc import AsyncIterator

from ember.adapters.ai.errors import AiProviderError
from ember.adapters.ai.interface import (
    ChatChunk,
    ChatRequest,
    ChatResult,
    EmbedRequest,
    EmbedResult,
    TokenUsage,
)
from ember_eval.text import content_words, coverage

NOT_CONFIRMED = "Not confirmed."
"""The reply the answer prompt asks for when the passages do not answer."""

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_BULLET = re.compile(r"^- \[[^\]]*\]\s*", re.MULTILINE)
"""The ``- [document] `` prefix the runner puts in front of each passage."""
_PASSAGES_MARKER = "Passages:\n"


class ExtractiveProvider:
    def __init__(self, *, min_overlap: float) -> None:
        self._min_overlap = min_overlap

    def _reply(self, request: ChatRequest) -> str:
        system = next((m.content for m in request.messages if m.role == "system"), "")
        question = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        passages = _BULLET.sub("", system.split(_PASSAGES_MARKER, maxsplit=1)[-1])
        wanted = content_words(question)
        best, best_overlap = "", 0.0
        for sentence in _SENTENCE_END.split(passages.replace("\n", " ")):
            overlap = coverage(wanted, content_words(sentence))
            if overlap > best_overlap:
                best, best_overlap = sentence.strip(), overlap
        return best if best_overlap >= self._min_overlap and best else NOT_CONFIRMED

    async def complete(self, request: ChatRequest) -> ChatResult:
        reply = self._reply(request)
        return ChatResult(text=reply, usage=TokenUsage(output_tokens=len(reply.split())))

    async def stream(self, request: ChatRequest) -> AsyncIterator[ChatChunk]:
        words = self._reply(request).split(" ")
        for word in words[:-1]:
            yield ChatChunk(text=word + " ")
        yield ChatChunk(text=words[-1])
        yield ChatChunk(usage=TokenUsage(output_tokens=len(words)))

    async def embed(self, request: EmbedRequest) -> EmbedResult:
        raise AiProviderError("The extractive fake does not embed.")

    async def aclose(self) -> None:
        return None
