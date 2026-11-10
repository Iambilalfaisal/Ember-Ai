"""Recording what each AI call cost.

The gateway writes one :class:`UsageRecord` per call attempt through a :class:`UsageRecorder`.
:class:`DbUsageRecorder` stores it in ``ai_usage`` in its **own** short transaction, not the
caller's: the tokens were spent even if the request later rolls back, and a streamed answer
finishes after the request's session may be gone. This is the one place outside the session
dependency that commits, and it only ever inserts.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Protocol

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ember.adapters.ai.models import AiUsage
from ember.core.tenancy import TenantContext, TenantScopedRepository

Operation = Literal["complete", "stream", "embed"]
UsageStatus = Literal["ok", "error", "timeout", "cancelled"]


@dataclass(frozen=True, slots=True)
class UsageRecord:
    tenant_id: uuid.UUID
    task: str
    operation: Operation
    provider: str
    model: str
    status: UsageStatus
    input_tokens: int
    output_tokens: int
    cost_usd: Decimal
    latency_ms: int
    first_token_ms: int | None
    is_fallback: bool
    prompt_name: str | None = None
    prompt_version: int | None = None
    error_type: str | None = None


class UsageRecorder(Protocol):
    async def record(self, usage: UsageRecord) -> None: ...


class AiUsageRepository(TenantScopedRepository[AiUsage]):
    model = AiUsage


class DbUsageRecorder:
    """Stores each record in ``ai_usage``, committed immediately."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def record(self, usage: UsageRecord) -> None:
        with TenantContext.use(usage.tenant_id):
            async with self._session_factory() as session:
                await AiUsageRepository(session).add(
                    AiUsage(
                        task=usage.task,
                        operation=usage.operation,
                        provider=usage.provider,
                        model=usage.model,
                        status=usage.status,
                        input_tokens=usage.input_tokens,
                        output_tokens=usage.output_tokens,
                        cost_usd=usage.cost_usd,
                        latency_ms=usage.latency_ms,
                        first_token_ms=usage.first_token_ms,
                        is_fallback=usage.is_fallback,
                        prompt_name=usage.prompt_name,
                        prompt_version=usage.prompt_version,
                        error_type=usage.error_type,
                    )
                )
                await session.commit()
