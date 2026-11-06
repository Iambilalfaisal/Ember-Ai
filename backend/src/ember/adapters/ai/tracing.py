"""Langfuse tracing for AI calls.

The gateway opens one *generation* per call attempt and ends it with the output, token usage
and cost. Prompts and answers appear in these traces and nowhere else (AGENTS.md section 9),
so the Langfuse host must be the tenant's own deployment outside local development
(ADR 0002). With no Langfuse keys configured, :class:`NullTracer` does nothing.

Langfuse 5 is built on OpenTelemetry, and a generation carries the prompt and the answer as span
attributes. So Langfuse gets its **own** tracer provider: on the app's global one, the generation
would also reach the app's OTLP exporter, putting content where AGENTS.md section 9 does not
allow it. OpenTelemetry context is shared across providers, so a generation still takes the
trace id of the span that is active when it starts (a live-call stage, a request) and the two
systems can be joined on it.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Protocol

from langfuse import Langfuse
from langfuse._client.span import LangfuseEmbedding, LangfuseGeneration
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SpanExporter

from ember.adapters.ai.interface import TokenUsage
from ember.adapters.ai.usage import Operation, UsageStatus
from ember.core.config import Settings


@dataclass(frozen=True, slots=True)
class TraceStart:
    task: str
    operation: Operation
    provider: str
    model: str
    tenant_id: str
    input: list[dict[str, str]] | list[str]
    """Chat messages, or the texts being embedded."""
    max_tokens: int | None
    temperature: float | None
    is_fallback: bool
    prompt_name: str | None
    prompt_version: int | None


class GenerationTrace(Protocol):
    def first_token(self) -> None:
        """Mark when the first piece of a streamed answer arrived."""
        ...

    def end(
        self,
        *,
        output: str | None,
        usage: TokenUsage,
        cost_usd: Decimal,
        status: UsageStatus,
        error_type: str | None,
    ) -> None: ...


class Tracer(Protocol):
    def start_generation(self, start: TraceStart) -> GenerationTrace: ...

    def shutdown(self) -> None:
        """Flush buffered traces. Called once when the process stops."""
        ...


class NullTrace:
    def first_token(self) -> None:
        return None

    def end(
        self,
        *,
        output: str | None,
        usage: TokenUsage,
        cost_usd: Decimal,
        status: UsageStatus,
        error_type: str | None,
    ) -> None:
        return None


class NullTracer:
    """Traces nothing. Used when Langfuse is not configured."""

    def start_generation(self, start: TraceStart) -> GenerationTrace:
        return NullTrace()

    def shutdown(self) -> None:
        return None


class _LangfuseTrace:
    def __init__(self, observation: LangfuseGeneration | LangfuseEmbedding) -> None:
        self._observation = observation
        self._first_token_at: datetime | None = None

    def first_token(self) -> None:
        if self._first_token_at is None:
            self._first_token_at = datetime.now(UTC)

    def end(
        self,
        *,
        output: str | None,
        usage: TokenUsage,
        cost_usd: Decimal,
        status: UsageStatus,
        error_type: str | None,
    ) -> None:
        failed = status != "ok"
        self._observation.update(
            output=output,
            usage_details={"input": usage.input_tokens, "output": usage.output_tokens},
            cost_details={"total": float(cost_usd)},
            completion_start_time=self._first_token_at,
            level="ERROR" if failed else "DEFAULT",
            status_message=f"{status}: {error_type}" if failed and error_type else status,
        )
        self._observation.end()


class LangfuseTracer:
    """Sends each AI call to Langfuse as a generation (or embedding) observation."""

    def __init__(self, client: Langfuse) -> None:
        self._client = client

    def start_generation(self, start: TraceStart) -> GenerationTrace:
        parameters: dict[str, Any] = {}
        if start.max_tokens is not None:
            parameters["max_tokens"] = start.max_tokens
        if start.temperature is not None:
            parameters["temperature"] = start.temperature
        metadata: dict[str, Any] = {
            "task": start.task,
            "operation": start.operation,
            "provider": start.provider,
            "tenant_id": start.tenant_id,
            "is_fallback": start.is_fallback,
        }
        if start.prompt_name is not None:
            metadata["prompt_name"] = start.prompt_name
            metadata["prompt_version"] = start.prompt_version
        observation: LangfuseGeneration | LangfuseEmbedding
        if start.operation == "embed":
            observation = self._client.start_observation(
                name=start.task,
                as_type="embedding",
                input=start.input,
                model=start.model,
                metadata=metadata,
            )
        else:
            observation = self._client.start_observation(
                name=start.task,
                as_type="generation",
                input=start.input,
                model=start.model,
                model_parameters=parameters,
                metadata=metadata,
            )
        return _LangfuseTrace(observation)

    def shutdown(self) -> None:
        self._client.shutdown()


def build_tracer(settings: Settings, *, span_exporter: SpanExporter | None = None) -> Tracer:
    """A :class:`LangfuseTracer` when host and both keys are set, otherwise a no-op tracer.

    ``span_exporter`` replaces the network exporter; tests use it to see what would be sent.
    """
    observability = settings.observability
    secret = observability.langfuse_secret_key
    # An empty value (a copied ``.env.example`` line) counts as not configured.
    secret_key = secret.get_secret_value() if secret is not None else ""
    if observability.langfuse_host and observability.langfuse_public_key and secret_key:
        return LangfuseTracer(
            Langfuse(
                host=observability.langfuse_host,
                public_key=observability.langfuse_public_key,
                secret_key=secret_key,
                environment=settings.env,
                tracer_provider=TracerProvider(),  # private: see the module docstring
                span_exporter=span_exporter,
            )
        )
    return NullTracer()
