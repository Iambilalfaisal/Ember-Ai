import json
import re
from typing import Any

import httpx
import pytest
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from ember.core.observability import bind_tenant_id, stage_timer
from ember.entrypoints.api import create_app
from tests.conftest import make_settings

Telemetry = tuple[InMemorySpanExporter, InMemoryMetricReader]


def _json_lines(text: str) -> list[dict[str, Any]]:
    return [json.loads(line) for line in text.splitlines() if line.startswith("{")]


def _completed_line(text: str) -> dict[str, Any]:
    return next(line for line in _json_lines(text) if line["event"] == "request.completed")


def _histogram_points(reader: InMemoryMetricReader, stage: str) -> list[Any]:
    data = reader.get_metrics_data()
    assert data is not None
    return [
        point
        for resource in data.resource_metrics
        for scope in resource.scope_metrics
        for metric in scope.metrics
        if metric.name == "ember.stage.duration"
        for point in metric.data.data_points
        if point.attributes == {"stage": stage}
    ]


# --- request id and JSON logs ------------------------------------------------


async def test_logs_are_json_with_request_id(capsys: pytest.CaptureFixture[str]) -> None:
    app = create_app(make_settings())
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/live")

    completed = _completed_line(capsys.readouterr().out)
    assert completed["request_id"] == response.headers["x-request-id"]
    assert completed["method"] == "GET"
    assert completed["path"] == "/health/live"
    assert completed["status"] == 200
    assert completed["level"] == "info"
    assert completed["duration_ms"] >= 0
    assert "timestamp" in completed


async def test_generates_request_id_when_absent(client: httpx.AsyncClient) -> None:
    response = await client.get("/health/live")

    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["x-request-id"])


async def test_keeps_valid_client_request_id(client: httpx.AsyncClient) -> None:
    response = await client.get("/health/live", headers={"X-Request-ID": "client-req-0001"})

    assert response.headers["x-request-id"] == "client-req-0001"


@pytest.mark.parametrize("bad", ["short", "has spaces in it!!", "x" * 65, "line;injection-1"])
async def test_replaces_invalid_client_request_id(client: httpx.AsyncClient, bad: str) -> None:
    response = await client.get("/health/live", headers={"X-Request-ID": bad})

    assert response.headers["x-request-id"] != bad
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["x-request-id"])


async def test_tenant_id_is_bound_to_logs(capsys: pytest.CaptureFixture[str]) -> None:
    # Build the app here, not in a fixture: its log handler binds to the current stdout.
    app = create_app(make_settings())

    @app.get("/test/tenant")
    async def tenant() -> None:
        bind_tenant_id("tenant-123")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/test/tenant")

    assert _completed_line(capsys.readouterr().out)["tenant_id"] == "tenant-123"


# --- stage_timer -------------------------------------------------------------


def test_stage_timer_records_span_and_histogram(telemetry: Telemetry) -> None:
    exporter, reader = telemetry

    with stage_timer("test_ok_stage"):
        pass

    span = next(s for s in exporter.get_finished_spans() if s.name == "stage.test_ok_stage")
    assert span.attributes is not None
    assert span.attributes["ember.stage"] == "test_ok_stage"
    assert span.status.status_code is not StatusCode.ERROR
    (point,) = _histogram_points(reader, "test_ok_stage")
    assert point.count == 1
    assert point.sum >= 0


def test_stage_timer_records_even_when_stage_fails(telemetry: Telemetry) -> None:
    exporter, reader = telemetry

    with pytest.raises(ValueError, match="boom"), stage_timer("test_failing_stage"):
        raise ValueError("boom")

    span = next(s for s in exporter.get_finished_spans() if s.name == "stage.test_failing_stage")
    assert span.status.status_code is StatusCode.ERROR
    (point,) = _histogram_points(reader, "test_failing_stage")
    assert point.count == 1


def test_stage_timer_spans_nest_under_the_current_span(telemetry: Telemetry) -> None:
    exporter, _ = telemetry

    with stage_timer("test_outer"), stage_timer("test_inner"):
        pass

    spans = {s.name: s for s in exporter.get_finished_spans()}
    inner, outer = spans["stage.test_inner"], spans["stage.test_outer"]
    assert inner.parent is not None
    assert inner.parent.span_id == outer.get_span_context().span_id
