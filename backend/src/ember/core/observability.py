"""Logging, tracing, metrics and request ids.

* ``configure_logging``: structlog JSON to stdout. stdlib and uvicorn logs go through
  the same pipeline. Request id, tenant id and trace id are attached automatically.
  Never log transcript text, document contents or personal data; log ids, counts and
  timings (AGENTS.md section 9).
* ``setup_telemetry``: OpenTelemetry tracer and meter providers.
* ``stage_timer``: wrap each live-pipeline stage to record a span and a latency histogram.
* ``RequestIdMiddleware``: assigns a request id and logs one line per request.
"""

import logging
import re
import sys
import time
import uuid
from collections.abc import Iterator, MutableMapping
from contextlib import contextmanager
from typing import Any

import structlog
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import MetricReader, PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor, SpanExporter
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ember.core.config import Settings

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

logger = structlog.get_logger(__name__)


# --- logging -----------------------------------------------------------------


def _add_trace_ids(
    _logger: Any, _method: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        event_dict["trace_id"] = format(context.trace_id, "032x")
        event_dict["span_id"] = format(context.span_id, "016x")
    return event_dict


def configure_logging(settings: Settings) -> None:
    """Send all logs (structlog, stdlib, uvicorn) to stdout as JSON. Safe to call repeatedly."""
    shared: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _add_trace_ids,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=False,
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=shared,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                structlog.processors.JSONRenderer(),
            ],
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.observability.log_level)
    # uvicorn installs its own handlers; route its records through ours instead.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True


def bind_tenant_id(tenant_id: str) -> None:
    """Attach the tenant id to every log line for the rest of this request or job."""
    structlog.contextvars.bind_contextvars(tenant_id=tenant_id)


# --- tracing and metrics -----------------------------------------------------

_telemetry_configured = False


def setup_telemetry(
    settings: Settings,
    *,
    span_exporter: SpanExporter | None = None,
    metric_reader: MetricReader | None = None,
) -> None:
    """Install the global OpenTelemetry providers once per process.

    Exports over OTLP/HTTP when ``observability.otlp_endpoint`` is set. Tests inject an
    in-memory exporter and reader instead. Later calls are no-ops.
    """
    global _telemetry_configured
    if _telemetry_configured:
        return
    _telemetry_configured = True

    endpoint = settings.observability.otlp_endpoint
    resource = Resource.create(
        {
            "service.name": settings.observability.service_name,
            "deployment.environment": settings.env,
        }
    )

    tracer_provider = TracerProvider(resource=resource)
    if span_exporter is not None:
        tracer_provider.add_span_processor(SimpleSpanProcessor(span_exporter))
    elif endpoint:
        otlp_spans = OTLPSpanExporter(endpoint=f"{endpoint.rstrip('/')}/v1/traces")
        tracer_provider.add_span_processor(BatchSpanProcessor(otlp_spans))
    trace.set_tracer_provider(tracer_provider)

    readers: list[MetricReader] = []
    if metric_reader is not None:
        readers.append(metric_reader)
    elif endpoint:
        otlp_metrics = OTLPMetricExporter(endpoint=f"{endpoint.rstrip('/')}/v1/metrics")
        readers.append(PeriodicExportingMetricReader(otlp_metrics))
    metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=readers))


_tracer = trace.get_tracer("ember")
_stage_duration = metrics.get_meter("ember").create_histogram(
    "ember.stage.duration",
    unit="ms",
    description="Latency of a pipeline stage",
)


@contextmanager
def stage_timer(stage: str) -> Iterator[trace.Span]:
    """Time one pipeline stage: records a ``stage.<name>`` span and a duration histogram.

    Use the stage names from AGENTS.md section 6 (``detect``, ``rewrite``, ``retrieve``,
    ``generate_first_token``, ``generate_total``). The duration is recorded even when the
    stage raises; the span is then marked as an error.
    """
    start = time.perf_counter()
    with _tracer.start_as_current_span(f"stage.{stage}", attributes={"ember.stage": stage}) as span:
        try:
            yield span
        finally:
            _stage_duration.record((time.perf_counter() - start) * 1000, {"stage": stage})


# --- request id middleware ---------------------------------------------------


class RequestIdMiddleware:
    """Pure ASGI middleware: bind a request id to logs, echo it, log one line per request.

    A client-supplied ``X-Request-ID`` is kept only if it is 8-64 chars of
    ``[A-Za-z0-9._-]``; anything else is replaced, so it is safe to log.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get(REQUEST_ID_HEADER)
        request_id = (
            incoming if incoming and _VALID_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        )
        scope.setdefault("state", {})["request_id"] = request_id
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        status_code = 500
        start = time.perf_counter()

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            logger.info(
                "request.completed",
                method=scope["method"],
                path=scope["path"],
                status=status_code,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
            )
            structlog.contextvars.clear_contextvars()
