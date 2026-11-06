"""What the AI gateway and its providers exchange.

A provider is one vendor behind the :class:`AiProvider` protocol (OpenAI, a fake for tests).
The gateway owns everything that is not vendor-specific: which model a task uses, timeouts,
fallback, cost, usage records and traces. Providers only turn a request into a vendor call.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol

Role = Literal["system", "user", "assistant"]


@dataclass(frozen=True, slots=True)
class Message:
    """One chat message. ``content`` may hold transcript or document text: never log it."""

    role: Role
    content: str


@dataclass(frozen=True, slots=True)
class PromptRef:
    """Which prompt file a call used, recorded with the usage so evals can compare versions."""

    name: str
    version: int


@dataclass(frozen=True, slots=True)
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass(frozen=True, slots=True)
class ChatRequest:
    model: str
    messages: tuple[Message, ...]
    max_tokens: int
    temperature: float | None = None


@dataclass(frozen=True, slots=True)
class ChatResult:
    text: str
    usage: TokenUsage


@dataclass(frozen=True, slots=True)
class ChatChunk:
    """One step of a streamed answer: a piece of text, or (last) the token usage."""

    text: str = ""
    usage: TokenUsage | None = None


@dataclass(frozen=True, slots=True)
class EmbedRequest:
    model: str
    texts: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class EmbedResult:
    vectors: list[list[float]]
    usage: TokenUsage


class AiProvider(Protocol):
    """One AI vendor. Raise :class:`~ember.adapters.ai.errors.AiProviderError` on any failure.

    Providers do not enforce timeouts, retry or record anything: the gateway does.
    """

    async def complete(self, request: ChatRequest) -> ChatResult: ...

    def stream(self, request: ChatRequest) -> AsyncIterator[ChatChunk]:
        """Yield text chunks as they arrive, then one chunk carrying the usage."""
        ...

    async def embed(self, request: EmbedRequest) -> EmbedResult: ...

    async def aclose(self) -> None: ...
