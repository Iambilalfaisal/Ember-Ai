"""Langfuse tracing, using the real Langfuse SDK with an in-memory span exporter (no network)."""

import json
import uuid
from collections.abc import Iterator
from decimal import Decimal
from typing import Any

import pytest
from langfuse import Langfuse
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic import SecretStr

from ember.adapters.ai.interface import TokenUsage
from ember.adapters.ai.tracing import (
    LangfuseTracer,
    NullTracer,
    TraceStart,
    build_tracer,
)
from ember.core.config import ObservabilitySettings
from ember.core.observability import stage_timer
from tests.conftest import make_settings


def start(**overrides: Any) -> TraceStart:
    values: dict[str, Any] = {
        "task": "live_answer",
        "operation": "stream",
        "provider": "openai",
        "model": "gpt-4o",
        "tenant_id": "tenant-1",
        "input": [{"role": "user", "content": "What does it cost?"}],
        "max_tokens": 400,
        "temperature": 0.2,
        "is_fallback": False,
        "prompt_name": "live_answer",
        "prompt_version": 2,
    }
    values.update(overrides)
    return TraceStart(**values)


class Rig:
    def __init__(self) -> None:
        self.exporter = InMemorySpanExporter()
        # A unique key per test: the SDK keeps one client per public key.
        self.client = Langfuse(
            public_key=f"pk-{uuid.uuid4().hex}",
            secret_key="sk-test",
            host="http://127.0.0.1:1",
            tracer_provider=TracerProvider(),
            span_exporter=self.exporter,
            tracing_enabled=True,
        )
        self.tracer = LangfuseTracer(self.client)

    def attributes(self) -> dict[str, Any]:
        self.client.flush()
        (span,) = self.exporter.get_finished_spans()
        return dict(span.attributes or {})


@pytest.fixture
def rig() -> Iterator[Rig]:
    rig = Rig()
    yield rig
    rig.client.shutdown()


def test_a_successful_call_is_sent_as_a_generation_with_everything_langfuse_needs(
    rig: Rig,
) -> None:
    trace = rig.tracer.start_generation(start())
    trace.first_token()
    trace.end(
        output="Ten dollars.",
        usage=TokenUsage(input_tokens=6, output_tokens=5),
        cost_usd=Decimal("0.00046"),
        status="ok",
        error_type=None,
    )

    attributes = rig.attributes()

    assert attributes["langfuse.observation.type"] == "generation"
    assert attributes["langfuse.observation.model.name"] == "gpt-4o"
    assert json.loads(attributes["langfuse.observation.input"]) == [
        {"role": "user", "content": "What does it cost?"}
    ]
    assert attributes["langfuse.observation.output"] == "Ten dollars."
    assert json.loads(attributes["langfuse.observation.usage_details"]) == {
        "input": 6,
        "output": 5,
    }
    assert json.loads(attributes["langfuse.observation.cost_details"]) == {"total": 0.00046}
    assert json.loads(attributes["langfuse.observation.model.parameters"]) == {
        "max_tokens": 400,
        "temperature": 0.2,
    }
    assert attributes["langfuse.observation.level"] == "DEFAULT"
    assert "langfuse.observation.completion_start_time" in attributes


def test_the_tenant_task_and_prompt_are_recorded_as_metadata(rig: Rig) -> None:
    trace = rig.tracer.start_generation(start(is_fallback=True))
    trace.end(
        output="x",
        usage=TokenUsage(),
        cost_usd=Decimal(0),
        status="ok",
        error_type=None,
    )

    attributes = rig.attributes()

    prefix = "langfuse.observation.metadata."
    assert json.loads(attributes[prefix + "tenant_id"]) == "tenant-1"
    assert json.loads(attributes[prefix + "task"]) == "live_answer"
    assert json.loads(attributes[prefix + "provider"]) == "openai"
    assert json.loads(attributes[prefix + "is_fallback"]) is True
    assert json.loads(attributes[prefix + "prompt_name"]) == "live_answer"
    assert json.loads(attributes[prefix + "prompt_version"]) == 2


def test_a_call_without_a_prompt_or_temperature_leaves_those_out(rig: Rig) -> None:
    trace = rig.tracer.start_generation(
        start(prompt_name=None, prompt_version=None, temperature=None)
    )
    trace.end(output="x", usage=TokenUsage(), cost_usd=Decimal(0), status="ok", error_type=None)

    attributes = rig.attributes()

    assert "langfuse.observation.metadata.prompt_name" not in attributes
    assert json.loads(attributes["langfuse.observation.model.parameters"]) == {"max_tokens": 400}


def test_a_failed_call_is_marked_as_an_error_with_the_reason(rig: Rig) -> None:
    trace = rig.tracer.start_generation(start())
    trace.end(
        output=None,
        usage=TokenUsage(),
        cost_usd=Decimal(0),
        status="timeout",
        error_type="AiTimeout",
    )

    attributes = rig.attributes()

    assert attributes["langfuse.observation.level"] == "ERROR"
    assert attributes["langfuse.observation.status_message"] == "timeout: AiTimeout"


def test_an_embedding_call_is_sent_as_an_embedding_observation(rig: Rig) -> None:
    trace = rig.tracer.start_generation(
        start(operation="embed", input=["pricing", "support"], max_tokens=None, temperature=None)
    )
    trace.end(
        output=None,
        usage=TokenUsage(input_tokens=2),
        cost_usd=Decimal("0.00000004"),
        status="ok",
        error_type=None,
    )

    attributes = rig.attributes()

    assert attributes["langfuse.observation.type"] == "embedding"
    assert json.loads(attributes["langfuse.observation.input"]) == ["pricing", "support"]


def test_without_langfuse_keys_nothing_is_traced() -> None:
    assert isinstance(build_tracer(make_settings()), NullTracer)


@pytest.mark.parametrize(
    "observability",
    [
        ObservabilitySettings(langfuse_host="https://lf.test", langfuse_public_key="pk"),
        ObservabilitySettings(langfuse_host="https://lf.test", langfuse_secret_key=SecretStr("sk")),
        ObservabilitySettings(langfuse_public_key="pk", langfuse_secret_key=SecretStr("sk")),
        # A copied .env.example line leaves empty values: that is "not configured".
        ObservabilitySettings(
            langfuse_host="https://lf.test",
            langfuse_public_key="",
            langfuse_secret_key=SecretStr(""),
        ),
    ],
)
def test_a_partly_configured_langfuse_traces_nothing(observability: ObservabilitySettings) -> None:
    assert isinstance(build_tracer(make_settings(observability=observability)), NullTracer)


def test_with_host_and_both_keys_langfuse_is_used() -> None:
    settings = make_settings(
        observability=ObservabilitySettings(
            langfuse_host="http://127.0.0.1:1",
            langfuse_public_key=f"pk-{uuid.uuid4().hex}",
            langfuse_secret_key=SecretStr("sk-test"),
        )
    )

    tracer = build_tracer(settings)
    try:
        assert isinstance(tracer, LangfuseTracer)
    finally:
        tracer.shutdown()


def test_the_null_tracer_accepts_every_call() -> None:
    trace = NullTracer().start_generation(start())
    trace.first_token()
    trace.end(output="x", usage=TokenUsage(), cost_usd=Decimal(0), status="ok", error_type=None)
    NullTracer().shutdown()


def test_prompts_and_answers_reach_langfuse_but_never_the_apps_own_trace_exporter(
    telemetry: tuple[InMemorySpanExporter, Any],
) -> None:
    # AGENTS.md section 9: content may appear only in Langfuse. The app's OpenTelemetry exporter
    # (OTLP) must see the stage span but not the AI generation, which carries the text.
    app_exporter, _ = telemetry
    langfuse_exporter = InMemorySpanExporter()
    settings = make_settings(
        observability=ObservabilitySettings(
            langfuse_host="http://127.0.0.1:1",
            langfuse_public_key=f"pk-{uuid.uuid4().hex}",
            langfuse_secret_key=SecretStr("sk-test"),
        )
    )
    tracer = build_tracer(settings, span_exporter=langfuse_exporter)
    assert isinstance(tracer, LangfuseTracer)
    secret = "TOPSECRET-PROMPT-TEXT"

    with stage_timer("generate_total") as stage_span:
        trace = tracer.start_generation(
            start(task="private_task", input=[{"role": "user", "content": secret}])
        )
        trace.end(
            output=secret, usage=TokenUsage(), cost_usd=Decimal(0), status="ok", error_type=None
        )
    tracer._client.flush()
    stage_trace_id = stage_span.get_span_context().trace_id

    app_spans = [s for s in app_exporter.get_finished_spans() if s.name == "private_task"]
    assert app_spans == []
    assert secret not in repr([dict(s.attributes or {}) for s in app_exporter.get_finished_spans()])
    (generation,) = langfuse_exporter.get_finished_spans()
    assert secret in repr(dict(generation.attributes or {}))
    # Still joined to the request/stage trace, so the two systems can be cross-referenced.
    assert generation.context.trace_id == stage_trace_id
    tracer.shutdown()
