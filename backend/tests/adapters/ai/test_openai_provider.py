"""The OpenAI provider against a mocked HTTP transport: exact requests, no network."""

import json
from collections.abc import Callable
from decimal import Decimal

import httpx
import pytest
from pydantic import SecretStr

from ember.adapters.ai.config import AiTasksConfig
from ember.adapters.ai.errors import AiNotConfigured, AiProviderError
from ember.adapters.ai.fake import InMemoryUsageRecorder
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.interface import (
    ChatChunk,
    ChatRequest,
    EmbedRequest,
    Message,
    TokenUsage,
)
from ember.adapters.ai.openai_provider import OpenAiProvider

API_KEY = "sk-test-do-not-leak-0123456789"
REQUEST = ChatRequest(
    model="gpt-test",
    messages=(Message("system", "Be brief."), Message("user", "Hello there")),
    max_tokens=50,
    temperature=0.2,
)

Handler = Callable[[httpx.Request], httpx.Response]


def provider_with(
    handler: Handler, *, api_key: str | None = API_KEY
) -> tuple[OpenAiProvider, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def recording(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(recording))
    key = SecretStr(api_key) if api_key is not None else None
    return OpenAiProvider(api_key=key, base_url="https://openai.test/v1/", client=client), seen


def sse(*events: dict[str, object] | str) -> httpx.Response:
    lines = [e if isinstance(e, str) else json.dumps(e) for e in events]
    body = "".join(f"data: {line}\n\n" for line in lines)
    return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})


def delta(text: str) -> dict[str, object]:
    return {"choices": [{"delta": {"content": text}}]}


USAGE_CHUNK = {"choices": [], "usage": {"prompt_tokens": 11, "completion_tokens": 3}}


# --- complete ------------------------------------------------------------------------


async def test_complete_sends_the_chat_request_and_reads_the_answer() -> None:
    provider, seen = provider_with(
        lambda _: httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "Ten dollars."}}],
                "usage": {"prompt_tokens": 11, "completion_tokens": 3, "total_tokens": 14},
            },
        )
    )

    result = await provider.complete(REQUEST)

    assert result.text == "Ten dollars."
    assert result.usage == TokenUsage(input_tokens=11, output_tokens=3)
    (request,) = seen
    assert request.method == "POST"
    assert str(request.url) == "https://openai.test/v1/chat/completions"
    assert request.headers["authorization"] == f"Bearer {API_KEY}"
    assert json.loads(request.content) == {
        "model": "gpt-test",
        "messages": [
            {"role": "system", "content": "Be brief."},
            {"role": "user", "content": "Hello there"},
        ],
        "max_completion_tokens": 50,
        "temperature": 0.2,
    }


async def test_temperature_is_left_out_when_the_task_sets_none() -> None:
    provider, seen = provider_with(
        lambda _: httpx.Response(200, json={"choices": [{"message": {"content": "x"}}]})
    )

    result = await provider.complete(ChatRequest("gpt-test", REQUEST.messages, max_tokens=5))

    assert "temperature" not in json.loads(seen[0].content)
    assert result.usage == TokenUsage()  # a reply without usage counts as zero


async def test_a_null_answer_is_an_empty_string() -> None:
    provider, _ = provider_with(
        lambda _: httpx.Response(200, json={"choices": [{"message": {"content": None}}]})
    )

    assert (await provider.complete(REQUEST)).text == ""


@pytest.mark.parametrize(
    "reply", [{}, {"choices": []}, {"choices": [{"message": 5}]}, {"error": "x"}]
)
async def test_an_unexpected_reply_is_a_provider_error(reply: dict[str, object]) -> None:
    provider, _ = provider_with(lambda _: httpx.Response(200, json=reply))

    with pytest.raises(AiProviderError, match="unexpected answer"):
        await provider.complete(REQUEST)


async def test_a_reply_that_is_not_json_is_a_provider_error() -> None:
    provider, _ = provider_with(lambda _: httpx.Response(200, content=b"<html>oops</html>"))

    with pytest.raises(AiProviderError, match="unexpected answer"):
        await provider.complete(REQUEST)


# --- errors ----------------------------------------------------------------------------


async def test_an_http_error_keeps_the_status_and_code_but_not_the_vendors_message() -> None:
    provider, _ = provider_with(
        lambda _: httpx.Response(
            429,
            json={
                "error": {
                    "message": "Rate limited while reading: PRIVATE PROMPT TEXT",
                    "type": "requests",
                    "code": "rate_limit_exceeded",
                }
            },
        )
    )

    with pytest.raises(AiProviderError) as caught:
        await provider.complete(REQUEST)

    error = caught.value
    assert (error.upstream_status, error.error_code) == (429, "rate_limit_exceeded")
    assert "PRIVATE PROMPT TEXT" not in str(error)
    assert "PRIVATE PROMPT TEXT" not in repr(error)
    assert error.status_code == 503  # what an API client would see


async def test_an_error_page_that_is_not_json_still_gives_a_clean_error() -> None:
    provider, _ = provider_with(lambda _: httpx.Response(502, content=b"<html>Bad gateway</html>"))

    with pytest.raises(AiProviderError) as caught:
        await provider.complete(REQUEST)

    assert (caught.value.upstream_status, caught.value.error_code) == (502, None)


async def test_a_network_failure_is_a_provider_error() -> None:
    def refuse(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host")

    provider, _ = provider_with(refuse)

    with pytest.raises(AiProviderError, match="could not be reached"):
        await provider.complete(REQUEST)


@pytest.mark.parametrize("key", [None, ""])
async def test_without_an_api_key_no_request_is_made(key: str | None) -> None:
    provider, seen = provider_with(lambda _: httpx.Response(200, json={}), api_key=key)

    with pytest.raises(AiNotConfigured):
        await provider.complete(REQUEST)
    with pytest.raises(AiNotConfigured):
        await provider.embed(EmbedRequest("m", ("x",)))
    with pytest.raises(AiNotConfigured):
        _ = [chunk async for chunk in provider.stream(REQUEST)]

    assert seen == []


async def test_the_api_key_never_appears_in_an_error() -> None:
    provider, _ = provider_with(lambda _: httpx.Response(401, json={"error": {"code": "bad_key"}}))

    with pytest.raises(AiProviderError) as caught:
        await provider.complete(REQUEST)

    assert API_KEY not in str(caught.value)
    assert API_KEY not in repr(caught.value)
    assert API_KEY not in repr(provider._api_key)  # SecretStr masks itself


# --- stream ----------------------------------------------------------------------------


async def test_stream_yields_text_pieces_then_the_usage() -> None:
    provider, seen = provider_with(
        lambda _: sse(delta("Ten "), delta("dollars."), USAGE_CHUNK, "[DONE]")
    )

    chunks = [chunk async for chunk in provider.stream(REQUEST)]

    assert chunks == [
        ChatChunk(text="Ten "),
        ChatChunk(text="dollars."),
        ChatChunk(usage=TokenUsage(input_tokens=11, output_tokens=3)),
    ]
    body = json.loads(seen[0].content)
    assert body["stream"] is True
    assert body["stream_options"] == {"include_usage": True}
    assert body["max_completion_tokens"] == 50


async def test_stream_skips_empty_deltas_and_comment_lines() -> None:
    provider, _ = provider_with(
        lambda _: httpx.Response(
            200,
            content=(
                ": keep-alive\n\n"
                'data: {"choices": [{"delta": {"role": "assistant"}}]}\n\n'
                f"data: {json.dumps(delta('Hi'))}\n\n"
                "data: [DONE]\n\n"
            ),
        )
    )

    assert [chunk async for chunk in provider.stream(REQUEST)] == [ChatChunk(text="Hi")]


async def test_stream_stops_at_done_and_ignores_what_follows() -> None:
    provider, _ = provider_with(lambda _: sse(delta("a"), "[DONE]", delta("never")))

    assert [chunk.text async for chunk in provider.stream(REQUEST)] == ["a"]


async def test_a_stream_that_cannot_start_raises_with_the_status() -> None:
    provider, _ = provider_with(
        lambda _: httpx.Response(500, json={"error": {"code": "server_error", "message": "x"}})
    )

    with pytest.raises(AiProviderError) as caught:
        _ = [chunk async for chunk in provider.stream(REQUEST)]

    assert (caught.value.upstream_status, caught.value.error_code) == (500, "server_error")


async def test_an_error_event_in_the_middle_of_a_stream_is_a_provider_error() -> None:
    provider, _ = provider_with(lambda _: sse(delta("Ten "), {"error": {"code": "overloaded"}}))
    received: list[ChatChunk] = []

    with pytest.raises(AiProviderError) as caught:
        async for chunk in provider.stream(REQUEST):
            received.append(chunk)

    assert received == [ChatChunk(text="Ten ")]
    assert caught.value.error_code == "overloaded"


async def test_a_garbled_stream_event_is_a_provider_error() -> None:
    provider, _ = provider_with(lambda _: sse("{not json"))

    with pytest.raises(AiProviderError, match="unexpected answer"):
        _ = [chunk async for chunk in provider.stream(REQUEST)]


# --- embed -----------------------------------------------------------------------------


async def test_embed_sends_the_texts_and_returns_vectors_in_input_order() -> None:
    provider, seen = provider_with(
        lambda _: httpx.Response(
            200,
            json={
                # The API may return items out of order; each carries its index.
                "data": [
                    {"index": 1, "embedding": [0.3, 0.4]},
                    {"index": 0, "embedding": [0.1, 0.2]},
                ],
                "usage": {"prompt_tokens": 7, "total_tokens": 7},
            },
        )
    )

    result = await provider.embed(EmbedRequest("embed-test", ("first", "second")))

    assert result.vectors == [[0.1, 0.2], [0.3, 0.4]]
    assert result.usage == TokenUsage(input_tokens=7, output_tokens=0)
    assert str(seen[0].url) == "https://openai.test/v1/embeddings"
    assert json.loads(seen[0].content) == {
        "model": "embed-test",
        "input": ["first", "second"],
        "encoding_format": "float",
    }


async def test_a_failed_embedding_request_is_a_provider_error() -> None:
    provider, _ = provider_with(lambda _: httpx.Response(400, json={"error": {"code": "x"}}))

    with pytest.raises(AiProviderError):
        await provider.embed(EmbedRequest("m", ("x",)))


# --- lifecycle ---------------------------------------------------------------------------


async def test_a_provider_closes_only_a_client_it_created() -> None:
    injected = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200)))
    await OpenAiProvider(api_key=None, client=injected).aclose()
    assert injected.is_closed is False
    await injected.aclose()

    own = OpenAiProvider(api_key=None)
    await own.aclose()
    assert own._client.is_closed is True


# --- through the gateway ---------------------------------------------------------------------


async def test_the_gateway_prices_a_streamed_openai_answer_from_the_vendors_usage() -> None:
    import uuid

    from ember.core.tenancy import TenantContext

    provider, _ = provider_with(
        lambda _: sse(delta("Ten "), delta("dollars."), USAGE_CHUNK, "[DONE]")
    )
    config = AiTasksConfig.model_validate(
        {
            "models": {
                "openai/gpt-test": {"input_per_million_usd": 2, "output_per_million_usd": 8}
            },
            "tasks": {
                "answer": {
                    "provider": "openai",
                    "model": "gpt-test",
                    "max_tokens": 50,
                    "timeout_seconds": 1,
                }
            },
        }
    )
    recorder = InMemoryUsageRecorder()
    gateway = AiGateway(config=config, providers={"openai": provider}, recorder=recorder)

    with TenantContext.use(uuid.uuid4()):
        pieces = [p async for p in gateway.stream(task="answer", messages=REQUEST.messages)]

    assert "".join(pieces) == "Ten dollars."
    (record,) = recorder.records
    assert (record.input_tokens, record.output_tokens) == (11, 3)
    # 11 input tokens at $2 per million + 3 output tokens at $8 per million
    assert record.cost_usd == Decimal("0.00004600")
