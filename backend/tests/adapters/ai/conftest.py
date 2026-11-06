import itertools
import uuid
from collections.abc import AsyncIterator, Iterator
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from ember.adapters.ai.config import AiTasksConfig
from ember.adapters.ai.fake import FakeAiProvider, InMemoryUsageRecorder
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.interface import Message
from ember.adapters.ai.tracing import GenerationTrace, TraceStart
from ember.adapters.ai.usage import UsageStatus
from ember.core.config import DbSettings
from ember.core.db import create_engine, create_session_factory
from ember.core.tenancy import TenantContext
from tests.conftest import make_settings

TENANT_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
MESSAGES = (Message("system", "Be brief."), Message("user", "What does it cost?"))
"""Two plus four words: 6 input tokens in the fake provider's word-count tokenizer."""
REPLY = "Pricing starts at ten dollars"
"""Five words: 5 output tokens, streamed as five chunks."""

# Prices chosen so costs are whole numbers: 1 USD per input token, 2 USD per output token.
PRICES = {
    "fake/chat": {"input_per_million_usd": 1_000_000, "output_per_million_usd": 2_000_000},
    "fake/backup": {"input_per_million_usd": 500_000, "output_per_million_usd": 1_000_000},
    "fake/embed": {"input_per_million_usd": 1_000_000},
}


def make_config(**answer_overrides: Any) -> AiTasksConfig:
    answer: dict[str, Any] = {
        "provider": "fake",
        "model": "chat",
        "max_tokens": 100,
        "timeout_seconds": 1,
        "temperature": 0.1,
        "fallback": {"provider": "fake", "model": "backup"},
    }
    answer.update(answer_overrides)
    return AiTasksConfig.model_validate(
        {
            "models": PRICES,
            "tasks": {
                "answer": answer,
                "plain": {
                    "provider": "fake",
                    "model": "chat",
                    "max_tokens": 100,
                    "timeout_seconds": 1,
                },
                "embedder": {
                    "kind": "embedding",
                    "provider": "fake",
                    "model": "embed",
                    "timeout_seconds": 1,
                },
            },
        }
    )


def step_clock(step: float = 0.1) -> Any:
    """A clock that advances ``step`` seconds per reading: 0.0, 0.1, 0.2, ..."""
    counter = itertools.count()
    return lambda: next(counter) * step


class RecordingTrace:
    def __init__(self, start: TraceStart) -> None:
        self.start = start
        self.first_token_seen = False
        self.ended: dict[str, Any] | None = None

    def first_token(self) -> None:
        self.first_token_seen = True

    def end(
        self,
        *,
        output: str | None,
        usage: Any,
        cost_usd: Decimal,
        status: UsageStatus,
        error_type: str | None,
    ) -> None:
        self.ended = {
            "output": output,
            "usage": usage,
            "cost_usd": cost_usd,
            "status": status,
            "error_type": error_type,
        }


class RecordingTracer:
    def __init__(self) -> None:
        self.traces: list[RecordingTrace] = []
        self.shut_down = False

    def start_generation(self, start: TraceStart) -> GenerationTrace:
        trace = RecordingTrace(start)
        self.traces.append(trace)
        return trace

    def shutdown(self) -> None:
        self.shut_down = True


class GatewayRig:
    """A gateway wired to fakes, plus handles on each fake."""

    def __init__(self, config: AiTasksConfig | None = None) -> None:
        self.provider = FakeAiProvider(reply=REPLY)
        self.recorder = InMemoryUsageRecorder()
        self.tracer = RecordingTracer()
        self.gateway = AiGateway(
            config=config or make_config(),
            providers={"fake": self.provider},
            recorder=self.recorder,
            tracer=self.tracer,
            clock=step_clock(),
        )


@pytest.fixture
def rig() -> GatewayRig:
    return GatewayRig()


@pytest.fixture
def current_tenant() -> Iterator[None]:
    """Run a test as ``TENANT_ID``. Opt in with ``pytest.mark.usefixtures("current_tenant")``."""
    with TenantContext.use(TENANT_ID):
        yield


# --- real Postgres (needs Docker) ---------------------------------------------


@pytest.fixture
async def engine(migrated_database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(make_settings(db=DbSettings(url=migrated_database_url)))  # type: ignore[arg-type]
    yield engine
    await engine.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return create_session_factory(engine)
