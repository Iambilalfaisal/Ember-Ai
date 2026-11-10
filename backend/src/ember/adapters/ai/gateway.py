"""The AI gateway: the only way code calls a model (AGENTS.md section 7).

Callers name a **task** (``live_answer``); ``config/ai_tasks.yaml`` decides the provider, model,
limits and fallback. For every call attempt the gateway enforces the task's timeout, computes
the cost, writes a usage record (tokens, cost, latency, tenant) and sends a Langfuse trace.
Neither the record nor the trace can fail a call: if either breaks, it is logged and the answer
is returned.

The tenant is the current :class:`~ember.core.tenancy.TenantContext` tenant, so a call outside
a request or job (no tenant) raises instead of recording usage against nobody.

Failure handling:

* ``complete`` / ``embed``: if the primary model fails or times out and the task has a
  ``fallback``, the fallback is tried; otherwise the error is raised.
* ``stream``: the same, but only while nothing has been sent to the caller. After the first
  piece of text a failure is raised as it is; the caller already has partial text and decides
  what to show (the live panel falls back to a pre-approved card).

Usage is recorded once per attempt, including failed and fallback attempts, with status ``ok``,
``error``, ``timeout`` or ``cancelled``. A call that is cancelled or abandoned part-way has no
token counts from the vendor, so its tokens (and cost) are recorded as zero.
"""

import asyncio
import time
import uuid
from collections.abc import AsyncGenerator, AsyncIterator, Callable, Mapping, Sequence
from dataclasses import dataclass

import structlog

from ember.adapters.ai.config import AiTasksConfig, ModelRef, TaskConfig
from ember.adapters.ai.errors import (
    AiConfigError,
    AiProviderError,
    AiTaskKindMismatch,
    AiTimeout,
    UnknownAiTask,
)
from ember.adapters.ai.interface import (
    AiProvider,
    ChatChunk,
    ChatRequest,
    EmbedRequest,
    Message,
    PromptRef,
    TokenUsage,
)
from ember.adapters.ai.tracing import GenerationTrace, NullTrace, NullTracer, Tracer, TraceStart
from ember.adapters.ai.usage import Operation, UsageRecord, UsageRecorder, UsageStatus
from ember.core.tenancy import TenantContext

logger = structlog.get_logger(__name__)

Clock = Callable[[], float]


@dataclass(frozen=True, slots=True)
class Completion:
    text: str
    usage: TokenUsage
    model: str
    used_fallback: bool


@dataclass(frozen=True, slots=True)
class Embeddings:
    vectors: list[list[float]]
    usage: TokenUsage
    model: str
    used_fallback: bool


@dataclass(frozen=True, slots=True)
class _Call:
    """A task resolved for one call: its settings, the models to try in order, the tenant."""

    task: str
    config: TaskConfig
    operation: Operation
    targets: tuple[tuple[ModelRef, bool], ...]
    """``(model, is_fallback)`` in the order they are tried."""
    tenant_id: uuid.UUID
    prompt: PromptRef | None
    trace_input: list[dict[str, str]] | list[str]


class _Attempt:
    """One try of one model: times it, then writes the usage record and ends the trace once."""

    def __init__(
        self,
        call: _Call,
        target: ModelRef,
        is_fallback: bool,
        *,
        config: AiTasksConfig,
        recorder: UsageRecorder,
        tracer: Tracer,
        clock: Clock,
    ) -> None:
        self._call = call
        self._target = target
        self._is_fallback = is_fallback
        self._config = config
        self._recorder = recorder
        self._clock = clock
        self._started = clock()
        self._first_token_at: float | None = None
        self._finished = False
        self._trace = _start_trace(tracer, call, target, is_fallback)

    def first_token(self) -> None:
        if self._first_token_at is None:
            self._first_token_at = self._clock()
            self._trace.first_token()

    async def finish(
        self,
        status: UsageStatus,
        *,
        usage: TokenUsage = TokenUsage(),  # noqa: B008 (immutable)
        output: str | None = None,
        error: BaseException | None = None,
    ) -> None:
        if self._finished:
            return
        self._finished = True
        now = self._clock()
        latency_ms = round((now - self._started) * 1000)
        first_token_ms = (
            None
            if self._first_token_at is None
            else round((self._first_token_at - self._started) * 1000)
        )
        cost = self._config.cost_usd(self._target, usage)
        # The class name only: an exception's message can echo prompt content.
        error_type = type(error).__name__ if error is not None else None
        prompt = self._call.prompt
        record = UsageRecord(
            tenant_id=self._call.tenant_id,
            task=self._call.task,
            operation=self._call.operation,
            provider=self._target.provider,
            model=self._target.model,
            status=status,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=cost,
            latency_ms=latency_ms,
            first_token_ms=first_token_ms,
            is_fallback=self._is_fallback,
            prompt_name=prompt.name if prompt else None,
            prompt_version=prompt.version if prompt else None,
            error_type=error_type,
        )
        logger.info(
            "ai.call",
            task=record.task,
            operation=record.operation,
            provider=record.provider,
            model=record.model,
            status=status,
            input_tokens=record.input_tokens,
            output_tokens=record.output_tokens,
            cost_usd=format(cost, "f"),
            latency_ms=latency_ms,
            first_token_ms=first_token_ms,
            is_fallback=self._is_fallback,
            error_type=error_type,
        )
        try:
            self._trace.end(
                output=output, usage=usage, cost_usd=cost, status=status, error_type=error_type
            )
        except Exception:
            logger.warning("ai.trace_failed", task=record.task, exc_info=True)
        try:
            await self._recorder.record(record)
        except Exception:
            # The call already happened and was paid for: report that, never fail the caller.
            logger.warning("ai.usage_record_failed", task=record.task, exc_info=True)


def _start_trace(
    tracer: Tracer, call: _Call, target: ModelRef, is_fallback: bool
) -> GenerationTrace:
    try:
        return tracer.start_generation(
            TraceStart(
                task=call.task,
                operation=call.operation,
                provider=target.provider,
                model=target.model,
                tenant_id=str(call.tenant_id),
                input=call.trace_input,
                max_tokens=call.config.max_tokens,
                temperature=call.config.temperature,
                is_fallback=is_fallback,
                prompt_name=call.prompt.name if call.prompt else None,
                prompt_version=call.prompt.version if call.prompt else None,
            )
        )
    except Exception:
        logger.warning("ai.trace_failed", task=call.task, exc_info=True)
        return NullTrace()


def _classify(exc: BaseException) -> tuple[UsageStatus, BaseException]:
    """The status to record for ``exc``, and the exception to raise to the caller."""
    if isinstance(exc, TimeoutError):
        return "timeout", AiTimeout()
    if isinstance(exc, AiTimeout):
        return "timeout", exc
    if isinstance(exc, asyncio.CancelledError | GeneratorExit):
        return "cancelled", exc
    return "error", exc


def _may_fall_back(status: UsageStatus, error: BaseException) -> bool:
    return status in ("error", "timeout") and isinstance(error, AiProviderError)


async def _close(chunks: AsyncIterator[ChatChunk]) -> None:
    if isinstance(chunks, AsyncGenerator):
        try:
            await chunks.aclose()
        except Exception:
            logger.debug("ai.stream_close_failed", exc_info=True)


class AiGateway:
    """Runs AI tasks. Build one per process with ``factory.build_ai_gateway``."""

    def __init__(
        self,
        *,
        config: AiTasksConfig,
        providers: Mapping[str, AiProvider],
        recorder: UsageRecorder,
        tracer: Tracer | None = None,
        clock: Clock = time.perf_counter,
    ) -> None:
        missing = config.providers_in_use() - providers.keys()
        if missing:
            raise AiConfigError(
                f"ai_tasks.yaml uses providers that are not registered: {sorted(missing)}."
            )
        self._config = config
        self._providers = dict(providers)
        self._recorder = recorder
        self._tracer: Tracer = tracer or NullTracer()
        self._clock = clock

    # --- public API ------------------------------------------------------------

    async def complete(
        self,
        *,
        task: str,
        messages: Sequence[Message],
        prompt: PromptRef | None = None,
    ) -> Completion:
        """Run a chat task and return the whole answer.

        Args:
            task: a chat task from ``ai_tasks.yaml``.
            messages: the conversation to send.
            prompt: the prompt file the messages came from, recorded with the usage.

        Raises:
            UnknownAiTask: ``task`` is not defined.
            AiTaskKindMismatch: ``task`` is an embedding task.
            TenantNotSet: there is no current tenant.
            AiProviderError: the model (and its fallback, if any) failed or timed out.
            AiNotConfigured: the provider has no credentials here.
        """
        call = self._resolve(task, "chat", "complete", prompt, _chat_input(messages))
        max_tokens = _max_tokens(call.config)
        last = len(call.targets) - 1
        for index, (target, is_fallback) in enumerate(call.targets):
            attempt = self._begin(call, target, is_fallback)
            request = ChatRequest(
                model=target.model,
                messages=tuple(messages),
                max_tokens=max_tokens,
                temperature=call.config.temperature,
            )
            try:
                async with asyncio.timeout(call.config.timeout_seconds):
                    result = await self._providers[target.provider].complete(request)
            except (Exception, asyncio.CancelledError) as exc:
                status, error = _classify(exc)
                await attempt.finish(status, error=error)
                if index < last and _may_fall_back(status, error):
                    _log_fallback(call, target, call.targets[index + 1][0], error)
                    continue
                if error is exc:
                    raise
                raise error from exc
            await attempt.finish("ok", usage=result.usage, output=result.text)
            return Completion(
                text=result.text, usage=result.usage, model=target.model, used_fallback=is_fallback
            )
        raise AssertionError("unreachable: the last target returns or raises")  # pragma: no cover

    def stream(
        self,
        *,
        task: str,
        messages: Sequence[Message],
        prompt: PromptRef | None = None,
    ) -> AsyncGenerator[str, None]:
        """Run a chat task and yield the answer piece by piece.

        The task is checked when this is called, so a wrong task name raises here, not on the
        first iteration. ``timeout_seconds`` bounds each wait for the next piece. Close the
        iterator (``aclose``) if you stop reading early; the usage is recorded either way.

        Raises:
            UnknownAiTask, AiTaskKindMismatch, TenantNotSet: as for :meth:`complete`.
            AiProviderError: while iterating, if the model failed or timed out (after the
                fallback, if any, was tried and nothing had been sent yet).
        """
        call = self._resolve(task, "chat", "stream", prompt, _chat_input(messages))
        return self._stream(call, tuple(messages))

    async def embed(self, *, task: str, texts: Sequence[str]) -> Embeddings:
        """Embed ``texts`` with an embedding task; one vector per text, in order.

        Raises:
            ValueError: ``texts`` is empty.
            UnknownAiTask, AiTaskKindMismatch, TenantNotSet, AiProviderError, AiNotConfigured:
                as for :meth:`complete`.
        """
        if not texts:
            raise ValueError("embed needs at least one text.")
        call = self._resolve(task, "embedding", "embed", None, list(texts))
        last = len(call.targets) - 1
        for index, (target, is_fallback) in enumerate(call.targets):
            attempt = self._begin(call, target, is_fallback)
            try:
                async with asyncio.timeout(call.config.timeout_seconds):
                    result = await self._providers[target.provider].embed(
                        EmbedRequest(model=target.model, texts=tuple(texts))
                    )
                if len(result.vectors) != len(texts):
                    raise AiProviderError("The AI provider returned an unexpected answer.")
            except (Exception, asyncio.CancelledError) as exc:
                status, error = _classify(exc)
                await attempt.finish(status, error=error)
                if index < last and _may_fall_back(status, error):
                    _log_fallback(call, target, call.targets[index + 1][0], error)
                    continue
                if error is exc:
                    raise
                raise error from exc
            await attempt.finish("ok", usage=result.usage)
            return Embeddings(
                vectors=result.vectors,
                usage=result.usage,
                model=target.model,
                used_fallback=is_fallback,
            )
        raise AssertionError("unreachable: the last target returns or raises")  # pragma: no cover

    async def aclose(self) -> None:
        """Close provider connections and flush buffered traces."""
        for provider in self._providers.values():
            await provider.aclose()
        await asyncio.to_thread(self._tracer.shutdown)

    # --- internals -------------------------------------------------------------

    def _resolve(
        self,
        task: str,
        kind: str,
        operation: Operation,
        prompt: PromptRef | None,
        trace_input: list[dict[str, str]] | list[str],
    ) -> _Call:
        config = self._config.tasks.get(task)
        if config is None:
            raise UnknownAiTask(f"No AI task named {task!r} in ai_tasks.yaml.")
        if config.kind != kind:
            raise AiTaskKindMismatch(f"AI task {task!r} is a {config.kind} task, not {kind}.")
        targets = [(config.primary, False)]
        if config.fallback is not None:
            targets.append((config.fallback, True))
        return _Call(
            task=task,
            config=config,
            operation=operation,
            targets=tuple(targets),
            tenant_id=TenantContext.require(),
            prompt=prompt,
            trace_input=trace_input,
        )

    def _begin(self, call: _Call, target: ModelRef, is_fallback: bool) -> _Attempt:
        return _Attempt(
            call,
            target,
            is_fallback,
            config=self._config,
            recorder=self._recorder,
            tracer=self._tracer,
            clock=self._clock,
        )

    async def _stream(
        self, call: _Call, messages: tuple[Message, ...]
    ) -> AsyncGenerator[str, None]:
        max_tokens = _max_tokens(call.config)
        last = len(call.targets) - 1
        for index, (target, is_fallback) in enumerate(call.targets):
            attempt = self._begin(call, target, is_fallback)
            chunks = (
                self._providers[target.provider]
                .stream(
                    ChatRequest(
                        model=target.model,
                        messages=messages,
                        max_tokens=max_tokens,
                        temperature=call.config.temperature,
                    )
                )
                .__aiter__()
            )
            sent = False
            usage = TokenUsage()
            parts: list[str] = []
            try:
                while True:
                    try:
                        async with asyncio.timeout(call.config.timeout_seconds):
                            chunk = await chunks.__anext__()
                    except StopAsyncIteration:
                        break
                    if chunk.usage is not None:
                        usage = chunk.usage
                    if chunk.text:
                        if not sent:
                            attempt.first_token()
                            sent = True
                        parts.append(chunk.text)
                        yield chunk.text
                await attempt.finish("ok", usage=usage, output="".join(parts))
                return
            except (Exception, asyncio.CancelledError, GeneratorExit) as exc:
                status, error = _classify(exc)
                await attempt.finish(
                    status, usage=usage, output="".join(parts) or None, error=error
                )
                if not sent and index < last and _may_fall_back(status, error):
                    _log_fallback(call, target, call.targets[index + 1][0], error)
                    continue
                if error is exc:
                    raise
                raise error from exc
            finally:
                await _close(chunks)


def _chat_input(messages: Sequence[Message]) -> list[dict[str, str]]:
    return [{"role": message.role, "content": message.content} for message in messages]


def _max_tokens(config: TaskConfig) -> int:
    if config.max_tokens is None:
        raise AiConfigError("A chat task has no max_tokens.")  # the config validator prevents this
    return config.max_tokens


def _log_fallback(call: _Call, failed: ModelRef, next_: ModelRef, error: BaseException) -> None:
    logger.warning(
        "ai.fallback",
        task=call.task,
        failed_model=failed.price_key,
        fallback_model=next_.price_key,
        error_type=type(error).__name__,
    )
