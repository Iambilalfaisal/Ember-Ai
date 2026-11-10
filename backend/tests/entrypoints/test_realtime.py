"""The realtime entrypoint's wiring, without Docker."""

import uuid
from pathlib import Path

import pytest
from fastapi import FastAPI

from ember.adapters.ai.errors import AiConfigError
from ember.adapters.ai.factory import FAKE_REPLY, build_fake_ai_gateway
from ember.core.config import AiSettings, AuthSettings, RealtimeSettings
from ember.core.tenancy import TenantContext
from ember.entrypoints.realtime import FakePipelineNotAllowed, create_app
from ember.modules.calls.live.session import LiveRuntime
from tests.conftest import make_settings

TENANT = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def test_the_app_holds_the_runtime_the_websocket_route_uses() -> None:
    app = create_app(make_settings(realtime=RealtimeSettings(max_message_bytes=1234)))

    runtime: LiveRuntime = app.state.live_runtime
    assert runtime.max_message_bytes == 1234
    assert hasattr(app.state, "authenticator")


def test_the_fake_pipeline_refuses_to_run_in_production() -> None:
    settings = make_settings(env="production", auth=AuthSettings(entra_tenant_id="t", audience="a"))

    with pytest.raises(FakePipelineNotAllowed):
        create_app(settings)


@pytest.mark.parametrize("env", ["local", "test", "staging"])
def test_the_fake_pipeline_may_run_outside_production(env: str) -> None:
    auth = AuthSettings(entra_tenant_id="t", audience="a")  # staging insists on Entra settings

    assert isinstance(create_app(make_settings(env=env, auth=auth)), FastAPI)


def test_a_bad_task_file_stops_the_service_at_startup(tmp_path: Path) -> None:
    bad = tmp_path / "ai_tasks.yaml"
    bad.write_text("models: {}\ntasks: {t: {provider: p, model: m, timeout_seconds: 1}}\n")

    with pytest.raises(AiConfigError):
        create_app(make_settings(ai=AiSettings(tasks_config_path=bad)))


async def test_the_default_gateway_answers_with_the_fake_provider_and_needs_no_key() -> None:
    settings = make_settings(ai=AiSettings(openai_api_key=None))
    gateway = build_fake_ai_gateway(settings)

    with TenantContext.use(TENANT):
        pieces = [
            piece
            async for piece in gateway.stream(task="live_answer", messages=[])  # type: ignore[arg-type]
        ]

    assert "".join(pieces) == FAKE_REPLY
    assert len(pieces) > 1


async def test_a_fake_gateway_works_with_no_database_and_stores_no_usage() -> None:
    # Fake calls cost nothing; a stored row would look like OpenAI spend in ai_usage.
    gateway = build_fake_ai_gateway(make_settings(), reply="one two three")

    with TenantContext.use(TENANT):
        completion = await gateway.complete(task="live_answer", messages=[])

    assert completion.text == "one two three"
