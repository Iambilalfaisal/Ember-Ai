"""Smoke test against the real OpenAI API. Skipped unless you ask for it.

It costs a fraction of a cent. Run it with a key in your ``.env`` (``EMBER_AI__OPENAI_API_KEY``)::

    EMBER_RUN_LIVE_TESTS=1 uv run pytest -m live

``uv run poe check`` and CI never run it (see ``pytest_collection_modifyitems`` in the root
conftest). It uses the shipped ``config/ai_tasks.yaml``, so it also proves those model names and
limits are accepted by the vendor.
"""

import uuid

import pytest

from ember.adapters.ai.config import load_tasks_config
from ember.adapters.ai.fake import InMemoryUsageRecorder
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.interface import Message
from ember.adapters.ai.openai_provider import OpenAiProvider
from ember.core.config import get_settings
from ember.core.tenancy import TenantContext

pytestmark = pytest.mark.live

# The shipped embedding model returns 1536 numbers per text. The knowledge module's pgvector
# column must match this when it is built.
EMBEDDING_DIMENSIONS = 1536


@pytest.fixture
def gateway() -> AiGateway:
    settings = get_settings()
    key = settings.ai.openai_api_key
    if key is None or not key.get_secret_value():
        pytest.skip("EMBER_AI__OPENAI_API_KEY is not set")
    return AiGateway(
        config=load_tasks_config(settings.ai.tasks_config_path),
        providers={
            "openai": OpenAiProvider(api_key=key, base_url=settings.ai.openai_base_url),
        },
        recorder=InMemoryUsageRecorder(),
    )


async def test_the_real_provider_completes_streams_and_embeds(gateway: AiGateway) -> None:
    recorder = gateway._recorder
    assert isinstance(recorder, InMemoryUsageRecorder)
    messages = [Message("user", "Reply with the single word: pong")]

    with TenantContext.use(uuid.uuid4()):
        completed = await gateway.complete(task="live_detect", messages=messages)
        streamed = [piece async for piece in gateway.stream(task="live_answer", messages=messages)]
        embedded = await gateway.embed(task="embed_query", texts=["How much does it cost?"])
    await gateway.aclose()

    assert "pong" in completed.text.lower()
    assert "pong" in "".join(streamed).lower()
    assert len(embedded.vectors[0]) == EMBEDDING_DIMENSIONS
    complete_row, stream_row, embed_row = recorder.records
    for row in (complete_row, stream_row, embed_row):
        assert row.status == "ok"
        assert row.input_tokens > 0
        assert row.cost_usd > 0
    assert stream_row.first_token_ms is not None
    assert stream_row.output_tokens > 0
