"""The latency budget (AGENTS.md section 10): pipeline overhead, excluding vendors, under 100 ms.

The AI provider is the fake one, which answers instantly, so what is measured here is Ember's own
cost: parsing, claiming the message number, the pipeline's stages, wrapping and sending each
event. The first test uses an in-memory store; the second claims message numbers in a real Redis.
"""

import asyncio
import statistics
import time
from collections.abc import AsyncIterator, Iterator

import pytest
from redis.asyncio import Redis

from ember.adapters.ai.config import AiTasksConfig
from ember.adapters.ai.fake import FakeAiProvider, InMemoryUsageRecorder
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.tracing import NullTracer
from ember.core.tenancy import TenantContext
from ember.modules.calls.live.pipeline import FakePipeline
from ember.modules.calls.live.session import LiveRuntime
from ember.modules.calls.live.store import KEY_PREFIX, RedisSessionStore, SessionStore
from tests.modules.calls.live.support import (
    TENANT,
    FakeConnection,
    InMemorySessionStore,
    final_frame,
    make_session,
    start_frame,
)

BUDGET_SECONDS = 0.100
QUESTIONS = 30
REPLY = "Pricing starts at ten dollars per user per month and includes support"


def make_gateway() -> AiGateway:
    config = AiTasksConfig.model_validate(
        {
            "models": {"fake/answer": {"input_per_million_usd": 1, "output_per_million_usd": 1}},
            "tasks": {
                "live_answer": {
                    "provider": "fake",
                    "model": "answer",
                    "max_tokens": 100,
                    "timeout_seconds": 1,
                }
            },
        }
    )
    return AiGateway(
        config=config,
        providers={"fake": FakeAiProvider(reply=REPLY)},
        recorder=InMemoryUsageRecorder(),
        tracer=NullTracer(),
    )


@pytest.fixture(autouse=True)
def current_tenant() -> Iterator[None]:
    with TenantContext.use(TENANT):
        yield


async def answer_times(store: SessionStore) -> list[float]:
    """Seconds from handing over a question to its ``card.end``, for several questions."""
    runtime = LiveRuntime(
        store=store,
        pipeline=FakePipeline(make_gateway()),
        max_message_bytes=64 * 1024,
        start_timeout_seconds=1,
    )
    connection = FakeConnection()
    task = asyncio.create_task(make_session(runtime, connection).run())
    connection.push(start_frame())
    await connection.wait_for_messages(1)

    times = []
    for number in range(1, QUESTIONS + 1):
        ends_before = connection.types().count("card.end")
        started = time.perf_counter()
        connection.push(final_frame(number, "How much does it cost?", utterance_id=f"u{number}"))
        await connection.wait_until(
            lambda before=ends_before: connection.types().count("card.end") > before
        )
        times.append(time.perf_counter() - started)

    connection.disconnect()
    await asyncio.wait_for(task, 2)
    return times


def assert_within_budget(times: list[float]) -> None:
    summary = (
        f"median {statistics.median(times) * 1000:.1f} ms, worst {max(times) * 1000:.1f} ms, "
        f"budget {BUDGET_SECONDS * 1000:.0f} ms"
    )
    assert len(times) == QUESTIONS
    assert max(times) < BUDGET_SECONDS, summary


async def test_pipeline_overhead_with_fakes_is_under_100_ms() -> None:
    assert_within_budget(await answer_times(InMemorySessionStore()))


async def forget_live_sessions(client: Redis) -> None:
    """Delete this test's sessions (fixed ids), so a Redis that outlives a run is harmless."""
    keys = [key async for key in client.scan_iter(f"{KEY_PREFIX}:{TENANT}:*")]
    if keys:
        await client.delete(*keys)


@pytest.fixture
async def redis(redis_url: str) -> AsyncIterator[Redis]:
    client = Redis.from_url(redis_url, decode_responses=True)
    await forget_live_sessions(client)  # a run less than a minute ago left its session behind
    yield client
    await forget_live_sessions(client)
    await client.aclose()


@pytest.mark.integration
async def test_pipeline_overhead_with_a_real_redis_is_under_100_ms(redis: Redis) -> None:
    store = RedisSessionStore(redis, session_ttl_seconds=60, ended_retention_seconds=60)

    assert_within_budget(await answer_times(store))
