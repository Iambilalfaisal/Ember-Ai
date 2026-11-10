"""OpenAI as an AI provider: chat completions (whole and streamed) and embeddings.

Talks to the REST API with ``httpx``, the project's HTTP client, instead of adding the vendor
SDK: three endpoints are all Ember needs, and a plain ``httpx`` client can be tested with
``httpx.MockTransport`` and no network. The API key is read from the secret only when a request
is made and never appears in an error or a log line.

Timeouts are the gateway's job, so the client has none of its own. Vendor error bodies are not
copied into exceptions: they can echo prompt content. Only the HTTP status and the vendor's short
error code are kept.
"""

from collections.abc import AsyncIterator
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError

from ember.adapters.ai.errors import AiNotConfigured, AiProviderError
from ember.adapters.ai.interface import (
    ChatChunk,
    ChatRequest,
    ChatResult,
    EmbedRequest,
    EmbedResult,
    TokenUsage,
)

DEFAULT_BASE_URL = "https://api.openai.com/v1"


class _Reply(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Usage(_Reply):
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def to_usage(self) -> TokenUsage:
        return TokenUsage(input_tokens=self.prompt_tokens, output_tokens=self.completion_tokens)


class _Message(_Reply):
    content: str | None = None


class _Choice(_Reply):
    message: _Message


class _ChatResponse(_Reply):
    choices: list[_Choice]
    usage: _Usage | None = None


class _Delta(_Reply):
    content: str | None = None


class _StreamChoice(_Reply):
    delta: _Delta = Field(default_factory=_Delta)


class _StreamError(_Reply):
    code: str | None = None


class _StreamChunk(_Reply):
    choices: list[_StreamChoice] = Field(default_factory=list)
    usage: _Usage | None = None
    error: _StreamError | None = None


class _EmbeddingItem(_Reply):
    index: int
    embedding: list[float]


class _EmbeddingResponse(_Reply):
    data: list[_EmbeddingItem]
    usage: _Usage | None = None


def _parse[ReplyT: _Reply](model: type[ReplyT], payload: str | bytes) -> ReplyT:
    try:
        return model.model_validate_json(payload)
    except ValidationError as exc:
        raise AiProviderError("The AI provider returned an unexpected answer.") from exc


def _error_from(response: httpx.Response) -> AiProviderError:
    """Turn a failed response into an error carrying the status and the vendor's error code."""
    code: str | None = None
    try:
        body = response.json()
        raw = body["error"]["code"] or body["error"]["type"]
        code = raw if isinstance(raw, str) else None
    except (ValueError, KeyError, TypeError):
        pass
    return AiProviderError(upstream_status=response.status_code, error_code=code)


class OpenAiProvider:
    def __init__(
        self,
        *,
        api_key: SecretStr | None,
        base_url: str = DEFAULT_BASE_URL,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._owns_client = client is None
        # No client-side timeout: the gateway bounds every call with the task's timeout_seconds.
        self._client = client or httpx.AsyncClient(timeout=None)  # noqa: S113

    # --- AiProvider ------------------------------------------------------------

    async def complete(self, request: ChatRequest) -> ChatResult:
        response = await self._post("/chat/completions", _chat_body(request))
        parsed = _parse(_ChatResponse, response.content)
        if not parsed.choices:
            raise AiProviderError("The AI provider returned an unexpected answer.")
        usage = parsed.usage.to_usage() if parsed.usage else TokenUsage()
        return ChatResult(text=parsed.choices[0].message.content or "", usage=usage)

    async def stream(self, request: ChatRequest) -> AsyncIterator[ChatChunk]:
        body = _chat_body(request)
        body["stream"] = True
        body["stream_options"] = {"include_usage": True}
        try:
            async with self._client.stream(
                "POST", f"{self._base_url}/chat/completions", json=body, headers=self._headers()
            ) as response:
                if response.status_code >= 400:
                    await response.aread()
                    raise _error_from(response)
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line.removeprefix("data:").strip()
                    if data == "[DONE]":
                        break
                    chunk = _parse(_StreamChunk, data)
                    if chunk.error is not None:
                        raise AiProviderError(error_code=chunk.error.code)
                    for choice in chunk.choices:
                        if choice.delta.content:
                            yield ChatChunk(text=choice.delta.content)
                    if chunk.usage is not None:
                        yield ChatChunk(usage=chunk.usage.to_usage())
        except httpx.HTTPError as exc:
            raise AiProviderError("The AI provider could not be reached.") from exc

    async def embed(self, request: EmbedRequest) -> EmbedResult:
        response = await self._post(
            "/embeddings",
            {"model": request.model, "input": list(request.texts), "encoding_format": "float"},
        )
        parsed = _parse(_EmbeddingResponse, response.content)
        ordered = sorted(parsed.data, key=lambda item: item.index)
        usage = parsed.usage.to_usage() if parsed.usage else TokenUsage()
        return EmbedResult(vectors=[item.embedding for item in ordered], usage=usage)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    # --- helpers ---------------------------------------------------------------

    def _headers(self) -> dict[str, str]:
        key = self._api_key.get_secret_value() if self._api_key is not None else ""
        if not key:
            raise AiNotConfigured("The OpenAI API key is not configured.")
        return {"Authorization": f"Bearer {key}"}

    async def _post(self, path: str, body: dict[str, Any]) -> httpx.Response:
        try:
            response = await self._client.post(
                f"{self._base_url}{path}", json=body, headers=self._headers()
            )
        except httpx.HTTPError as exc:
            raise AiProviderError("The AI provider could not be reached.") from exc
        if response.status_code >= 400:
            raise _error_from(response)
        return response


def _chat_body(request: ChatRequest) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": request.model,
        "messages": [{"role": m.role, "content": m.content} for m in request.messages],
        "max_completion_tokens": request.max_tokens,
    }
    if request.temperature is not None:
        body["temperature"] = request.temperature
    return body
