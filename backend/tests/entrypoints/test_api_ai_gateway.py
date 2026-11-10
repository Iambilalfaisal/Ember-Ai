"""The API builds the AI gateway at startup and shares it with routes."""

import uuid
from pathlib import Path

import pytest
from fastapi import FastAPI, Request

from ember.adapters.ai.errors import AiConfigError
from ember.adapters.ai.factory import get_ai_gateway
from ember.adapters.ai.gateway import AiGateway
from ember.core.config import AiSettings, RedisSettings, TasksSettings
from ember.entrypoints.api import create_app
from tests.conftest import make_settings


def test_the_app_holds_one_gateway_for_routes_to_use(app: FastAPI) -> None:
    assert isinstance(app.state.ai_gateway, AiGateway)

    request = Request({"type": "http", "app": app, "headers": []})
    assert get_ai_gateway(request) is app.state.ai_gateway


def test_a_bad_task_file_stops_the_app_at_startup(tmp_path: Path) -> None:
    bad = tmp_path / "ai_tasks.yaml"
    bad.write_text("models: {}\ntasks: {t: {provider: p, model: m, timeout_seconds: 1}}\n")

    with pytest.raises(AiConfigError):
        create_app(make_settings(ai=AiSettings(tasks_config_path=bad)))


@pytest.mark.integration
async def test_the_gateway_is_closed_when_the_app_stops(
    redis_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Closing the gateway flushes buffered Langfuse traces: skipping it would drop them silently.
    app = create_app(
        make_settings(
            redis=RedisSettings(url=redis_url),  # type: ignore[arg-type]
            tasks=TasksSettings(queue_name=f"test-{uuid.uuid4().hex[:8]}"),
        )
    )
    closed: list[bool] = []
    original = app.state.ai_gateway.aclose

    async def spy() -> None:
        closed.append(True)
        await original()

    monkeypatch.setattr(app.state.ai_gateway, "aclose", spy)

    async with app.router.lifespan_context(app):
        assert closed == []

    assert closed == [True]
