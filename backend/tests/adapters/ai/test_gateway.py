"""The AI gateway against fake providers: no network, no database."""

import asyncio
import contextvars
from decimal import Decimal
from pathlib import Path

import pytest
import structlog

from ember.adapters.ai.config import load_tasks_config
from ember.adapters.ai.errors import (
    AiConfigError,
    AiProviderError,
    AiTaskKindMismatch,
    AiTimeout,
    UnknownAiTask,
)
from ember.adapters.ai.fake import FakeAiProvider, InMemoryUsageRecorder
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.interface import EmbedRequest, EmbedResult, PromptRef
from ember.adapters.ai.tracing import TraceStart
from ember.adapters.ai.usage import UsageRecord
from ember.core.tenancy import TenantContext, TenantNotSet
from tests.adapters.ai.conftest import (
    MESSAGES,
    REPLY,
    TENANT_ID,
    GatewayRig,
    RecordingTracer,
    make_config,
    step_clock,
)

pytestmark = pytest.mark.usefixtures("current_tenant")

# --- the three operations ------------------------------------------------------


async def test_complete_returns_the_answer_and_records_what_it_cost(rig: GatewayRig) -> None:
    result = await rig.gateway.complete(task="answer", messages=MESSAGES)

    assert result.text == REPLY
    assert (result.usage.input_tokens, result.usage.output_tokens) == (6, 5)
    assert (result.model, result.used_fallback) == ("chat", False)
    (record,) = rig.recorder.records
    assert record == UsageRecord(
        tenant_id=TENANT_ID,
        task="answer",
        operation="complete",
        provider="fake",
        model="chat",
        status="ok",
        input_tokens=6,
        output_tokens=5,
        cost_usd=Decimal("16"),  # 6 tokens at $1 + 5 tokens at $2
        latency_ms=100,
        first_token_ms=None,
        is_fallback=False,
    )


async def test_the_task_decides_the_model_and_limits_sent_to_the_provider(rig: GatewayRig) -> None:
    await rig.gateway.complete(task="answer", messages=MESSAGES)

    (request,) = rig.provider.chat_requests
    assert request.model == "chat"
    assert request.max_tokens == 100
    assert request.temperature == 0.1
    assert request.messages == MESSAGES


async def test_stream_yields_the_pieces_in_order_and_records_one_usage_row(
    rig: GatewayRig,
) -> None:
    pieces = [piece async for piece in rig.gateway.stream(task="answer", messages=MESSAGES)]

    assert "".join(pieces) == REPLY
    assert len(pieces) == 5
    (record,) = rig.recorder.records
    assert (record.operation, record.status, record.is_fallback) == ("stream", "ok", False)
    assert (record.input_tokens, record.output_tokens) == (6, 5)
    assert record.cost_usd == Decimal("16")
    assert record.latency_ms == 200
    assert record.first_token_ms == 100


async def test_embed_returns_one_vector_per_text_and_records_the_tokens(rig: GatewayRig) -> None:
    result = await rig.gateway.embed(task="embedder", texts=["pricing and plans", "support"])

    assert len(result.vectors) == 2
    assert len(result.vectors[0]) == rig.provider.dimensions
    assert result.vectors[0] != result.vectors[1]
    (record,) = rig.recorder.records
    assert (record.operation, record.model, record.status) == ("embed", "embed", "ok")
    assert (record.input_tokens, record.output_tokens) == (4, 0)
    assert record.cost_usd == Decimal("4")


async def test_the_prompt_that_produced_the_messages_is_recorded(rig: GatewayRig) -> None:
    await rig.gateway.complete(
        task="answer", messages=MESSAGES, prompt=PromptRef(name="live_answer", version=3)
    )

    (record,) = rig.recorder.records
    assert (record.prompt_name, record.prompt_version) == ("live_answer", 3)
    assert rig.tracer.traces[0].start.prompt_name == "live_answer"
    assert rig.tracer.traces[0].start.prompt_version == 3


# --- programming errors ----------------------------------------------------------


async def test_an_unknown_task_is_an_error_and_records_nothing(rig: GatewayRig) -> None:
    with pytest.raises(UnknownAiTask, match="nope"):
        await rig.gateway.complete(task="nope", messages=MESSAGES)

    assert rig.recorder.records == []


def test_a_wrong_task_for_stream_is_reported_when_called_not_when_iterated(
    rig: GatewayRig,
) -> None:
    with pytest.raises(UnknownAiTask):
        rig.gateway.stream(task="nope", messages=MESSAGES)
    with pytest.raises(AiTaskKindMismatch):
        rig.gateway.stream(task="embedder", messages=MESSAGES)


async def test_chat_and_embedding_tasks_cannot_be_swapped(rig: GatewayRig) -> None:
    with pytest.raises(AiTaskKindMismatch, match="embedding task"):
        await rig.gateway.complete(task="embedder", messages=MESSAGES)
    with pytest.raises(AiTaskKindMismatch, match="chat task"):
        await rig.gateway.embed(task="answer", texts=["x"])


async def test_embedding_nothing_is_an_error(rig: GatewayRig) -> None:
    with pytest.raises(ValueError, match="at least one"):
        await rig.gateway.embed(task="embedder", texts=[])


async def test_a_call_with_no_tenant_is_refused_and_records_nothing(rig: GatewayRig) -> None:
    # A fresh, empty context: no current tenant, as in code running outside a request or job.
    no_tenant = contextvars.Context()
    assert no_tenant.run(TenantContext.get) is None

    task = asyncio.get_running_loop().create_task(
        rig.gateway.complete(task="answer", messages=MESSAGES), context=no_tenant
    )
    with pytest.raises(TenantNotSet):
        await task

    assert rig.recorder.records == []
    assert rig.provider.chat_requests == []


def test_the_gateway_refuses_a_config_naming_a_provider_that_is_not_registered() -> None:
    with pytest.raises(AiConfigError, match=r"\['fake'\]"):
        AiGateway(config=make_config(), providers={}, recorder=InMemoryUsageRecorder())


# --- switching models is a config change ------------------------------------------


async def test_changing_a_tasks_model_needs_only_the_yaml_file(tmp_path: Path) -> None:
    yaml_text = """
models:
  fake/chat: {input_per_million_usd: 1000000, output_per_million_usd: 2000000}
  fake/backup: {input_per_million_usd: 500000, output_per_million_usd: 1000000}
tasks:
  answer: {provider: fake, model: chat, max_tokens: 50, timeout_seconds: 1}
"""
    path = tmp_path / "ai_tasks.yaml"
    models_used = []
    costs = []
    for model in ("chat", "backup"):
        path.write_text(yaml_text.replace("model: chat", f"model: {model}"), encoding="utf-8")
        rig = GatewayRig(load_tasks_config(path))
        await rig.gateway.complete(task="answer", messages=MESSAGES)
        models_used.append(rig.provider.chat_requests[0].model)
        costs.append(rig.recorder.records[0].cost_usd)

    assert models_used == ["chat", "backup"]
    assert costs == [Decimal("16"), Decimal("8")]  # the new model's price is used too


# --- fallback ----------------------------------------------------------------------


async def test_complete_falls_back_when_the_primary_fails(rig: GatewayRig) -> None:
    rig.provider.fail_next(AiProviderError())

    result = await rig.gateway.complete(task="answer", messages=MESSAGES)

    assert (result.text, result.model, result.used_fallback) == (REPLY, "backup", True)
    failed, succeeded = rig.recorder.records
    assert (failed.model, failed.status, failed.is_fallback) == ("chat", "error", False)
    assert (failed.error_type, failed.input_tokens, failed.cost_usd) == (
        "AiProviderError",
        0,
        Decimal(0),
    )
    assert (succeeded.model, succeeded.status, succeeded.is_fallback) == ("backup", "ok", True)
    assert succeeded.cost_usd == Decimal("8")  # priced at the fallback model's rates


async def test_complete_falls_back_when_the_primary_times_out() -> None:
    rig = GatewayRig(make_config(timeout_seconds=0.05))
    rig.provider.hang_next()

    result = await rig.gateway.complete(task="answer", messages=MESSAGES)

    assert result.used_fallback is True
    assert [r.status for r in rig.recorder.records] == ["timeout", "ok"]
    assert rig.recorder.records[0].error_type == "AiTimeout"


async def test_a_timeout_without_a_fallback_raises_ai_timeout() -> None:
    rig = GatewayRig(make_config(timeout_seconds=0.05, fallback=None))
    rig.provider.hang_next()

    with pytest.raises(AiTimeout):
        await rig.gateway.complete(task="answer", messages=MESSAGES)

    (record,) = rig.recorder.records
    assert record.status == "timeout"


async def test_a_failure_without_a_fallback_is_raised_and_recorded(rig: GatewayRig) -> None:
    rig.provider.fail_next(AiProviderError(upstream_status=500))

    with pytest.raises(AiProviderError):
        await rig.gateway.complete(task="plain", messages=MESSAGES)

    (record,) = rig.recorder.records
    assert (record.status, record.error_type) == ("error", "AiProviderError")


async def test_when_the_fallback_fails_too_its_error_is_raised(rig: GatewayRig) -> None:
    rig.provider.fail_next(AiProviderError())
    rig.provider.fail_next(AiProviderError())

    with pytest.raises(AiProviderError):
        await rig.gateway.complete(task="answer", messages=MESSAGES)

    assert [(r.model, r.status) for r in rig.recorder.records] == [
        ("chat", "error"),
        ("backup", "error"),
    ]


async def test_a_bug_is_not_retried_on_the_fallback(rig: GatewayRig) -> None:
    rig.provider.fail_next(RuntimeError("boom"))

    with pytest.raises(RuntimeError, match="boom"):
        await rig.gateway.complete(task="answer", messages=MESSAGES)

    assert len(rig.provider.chat_requests) == 1
    assert [r.status for r in rig.recorder.records] == ["error"]


async def test_embed_falls_back_too() -> None:
    config = make_config()
    config = type(config).model_validate(
        {
            **config.model_dump(mode="json"),
            "tasks": {
                **config.model_dump(mode="json")["tasks"],
                "embedder": {
                    "kind": "embedding",
                    "provider": "fake",
                    "model": "embed",
                    "timeout_seconds": 1,
                    "fallback": {"provider": "fake", "model": "backup"},
                },
            },
        }
    )
    rig = GatewayRig(config)
    rig.provider.fail_next(AiProviderError())

    result = await rig.gateway.embed(task="embedder", texts=["x"])

    assert (result.model, result.used_fallback) == ("backup", True)


async def test_embedding_the_wrong_number_of_vectors_is_a_provider_error() -> None:
    class ShortProvider(FakeAiProvider):
        async def embed(self, request: EmbedRequest) -> EmbedResult:
            result = await super().embed(request)
            return EmbedResult(vectors=result.vectors[:1], usage=result.usage)

    rig = GatewayRig()
    rig.provider = ShortProvider()
    rig.gateway = AiGateway(
        config=make_config(),
        providers={"fake": rig.provider},
        recorder=rig.recorder,
        clock=step_clock(),
    )

    with pytest.raises(AiProviderError):
        await rig.gateway.embed(task="embedder", texts=["a", "b"])

    assert [r.status for r in rig.recorder.records] == ["error"]


# --- streaming failures --------------------------------------------------------------


async def test_a_stream_that_fails_before_any_text_uses_the_fallback(rig: GatewayRig) -> None:
    rig.provider.fail_next(AiProviderError(), after_chunks=0)

    pieces = [piece async for piece in rig.gateway.stream(task="answer", messages=MESSAGES)]

    assert "".join(pieces) == REPLY
    assert [(r.model, r.status, r.is_fallback) for r in rig.recorder.records] == [
        ("chat", "error", False),
        ("backup", "ok", True),
    ]


async def test_a_stream_that_stalls_before_any_text_uses_the_fallback() -> None:
    rig = GatewayRig(make_config(timeout_seconds=0.05))
    rig.provider.hang_next(after_chunks=0)

    pieces = [piece async for piece in rig.gateway.stream(task="answer", messages=MESSAGES)]

    assert "".join(pieces) == REPLY
    assert [r.status for r in rig.recorder.records] == ["timeout", "ok"]


async def test_a_stream_that_fails_after_text_was_sent_is_raised_not_retried(
    rig: GatewayRig,
) -> None:
    rig.provider.fail_next(AiProviderError(), after_chunks=2)
    received: list[str] = []

    with pytest.raises(AiProviderError):
        async for piece in rig.gateway.stream(task="answer", messages=MESSAGES):
            received.append(piece)

    assert received == ["Pricing ", "starts "]  # the caller keeps what it already got
    assert len(rig.provider.chat_requests) == 1  # a second model would repeat the first words
    (record,) = rig.recorder.records
    assert (record.status, record.first_token_ms) == ("error", 100)


async def test_a_stream_that_stalls_midway_times_out_without_a_fallback() -> None:
    rig = GatewayRig(make_config(timeout_seconds=0.05))
    rig.provider.hang_next(after_chunks=1)
    received: list[str] = []

    with pytest.raises(AiTimeout):
        async for piece in rig.gateway.stream(task="answer", messages=MESSAGES):
            received.append(piece)

    assert received == ["Pricing "]
    assert [r.status for r in rig.recorder.records] == ["timeout"]


async def test_a_slow_consumer_does_not_count_against_the_provider_timeout() -> None:
    rig = GatewayRig(make_config(timeout_seconds=0.05))
    received: list[str] = []

    async for piece in rig.gateway.stream(task="answer", messages=MESSAGES):
        received.append(piece)
        await asyncio.sleep(0.08)  # longer than timeout_seconds, spent outside the provider

    assert "".join(received) == REPLY
    assert [r.status for r in rig.recorder.records] == ["ok"]


async def test_closing_a_stream_early_records_a_cancelled_attempt(rig: GatewayRig) -> None:
    stream = rig.gateway.stream(task="answer", messages=MESSAGES)
    assert await anext(stream) == "Pricing "

    await stream.aclose()

    (record,) = rig.recorder.records
    assert (record.status, record.first_token_ms) == ("cancelled", 100)
    assert (record.input_tokens, record.output_tokens, record.cost_usd) == (0, 0, Decimal(0))
    assert len(rig.provider.chat_requests) == 1


async def test_cancelling_the_task_reading_a_stream_records_a_cancelled_attempt(
    rig: GatewayRig,
) -> None:
    rig.provider.hang_next(after_chunks=1)
    first_piece_read = asyncio.Event()

    async def consume() -> None:
        async for _ in rig.gateway.stream(task="plain", messages=MESSAGES):
            first_piece_read.set()

    task = asyncio.get_running_loop().create_task(consume())
    await first_piece_read.wait()
    await asyncio.sleep(0)  # let the reader move on to waiting for the second piece
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    (record,) = rig.recorder.records
    assert record.status == "cancelled"
    assert len(rig.provider.chat_requests) == 1


# --- recording and tracing never break a call -------------------------------------------


async def test_a_failing_usage_recorder_does_not_fail_the_call(rig: GatewayRig) -> None:
    class BrokenRecorder:
        async def record(self, usage: UsageRecord) -> None:
            raise RuntimeError("database is down")

    gateway = AiGateway(
        config=make_config(),
        providers={"fake": rig.provider},
        recorder=BrokenRecorder(),
        clock=step_clock(),
    )

    with structlog.testing.capture_logs() as logs:
        result = await gateway.complete(task="answer", messages=MESSAGES)
        pieces = [piece async for piece in gateway.stream(task="answer", messages=MESSAGES)]

    assert result.text == REPLY
    assert "".join(pieces) == REPLY
    failures = [log for log in logs if log["event"] == "ai.usage_record_failed"]
    assert len(failures) == 2


async def test_a_failing_tracer_does_not_fail_the_call(rig: GatewayRig) -> None:
    class BrokenTracer(RecordingTracer):
        def start_generation(self, start: TraceStart):  # type: ignore[no-untyped-def]
            raise RuntimeError("langfuse is down")

    gateway = AiGateway(
        config=make_config(),
        providers={"fake": rig.provider},
        recorder=rig.recorder,
        tracer=BrokenTracer(),
        clock=step_clock(),
    )

    with structlog.testing.capture_logs() as logs:
        result = await gateway.complete(task="answer", messages=MESSAGES)

    assert result.text == REPLY
    assert len(rig.recorder.records) == 1
    assert any(log["event"] == "ai.trace_failed" for log in logs)


async def test_the_trace_gets_the_input_output_usage_cost_and_tenant(rig: GatewayRig) -> None:
    await rig.gateway.complete(task="answer", messages=MESSAGES)

    (trace,) = rig.tracer.traces
    assert trace.start.task == "answer"
    assert trace.start.model == "chat"
    assert trace.start.tenant_id == str(TENANT_ID)
    assert trace.start.input == [
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "What does it cost?"},
    ]
    assert trace.ended is not None
    assert trace.ended["output"] == REPLY
    assert trace.ended["cost_usd"] == Decimal("16")
    assert trace.ended["status"] == "ok"


async def test_a_streamed_trace_marks_the_first_token(rig: GatewayRig) -> None:
    _ = [piece async for piece in rig.gateway.stream(task="answer", messages=MESSAGES)]

    (trace,) = rig.tracer.traces
    assert trace.first_token_seen is True
    assert trace.ended is not None
    assert trace.ended["output"] == REPLY


async def test_a_failed_attempt_is_traced_as_an_error(rig: GatewayRig) -> None:
    rig.provider.fail_next(AiProviderError())

    with pytest.raises(AiProviderError):
        await rig.gateway.complete(task="plain", messages=MESSAGES)

    (trace,) = rig.tracer.traces
    assert trace.ended is not None
    assert (trace.ended["status"], trace.ended["error_type"]) == ("error", "AiProviderError")


async def test_log_lines_never_contain_prompts_answers_or_error_messages() -> None:
    secret = "TOPSECRET-TRANSCRIPT-TEXT"
    rig = GatewayRig()
    rig.provider.reply = f"answer mentioning {secret}"
    rig.provider.fail_next(RuntimeError(f"vendor echoed {secret}"))
    messages = (*MESSAGES, MESSAGES[0].__class__("user", f"{secret} please"))

    with structlog.testing.capture_logs() as logs:
        with pytest.raises(RuntimeError):
            await rig.gateway.complete(task="plain", messages=messages)
        await rig.gateway.complete(task="plain", messages=messages)
        _ = [p async for p in rig.gateway.stream(task="plain", messages=messages)]

    assert logs  # the calls are logged...
    assert secret not in repr(logs)  # ...but never with their content


async def test_aclose_closes_the_providers_and_flushes_the_tracer(rig: GatewayRig) -> None:
    await rig.gateway.aclose()

    assert rig.provider.closed is True
    assert rig.tracer.shut_down is True
