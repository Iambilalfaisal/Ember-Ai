"""Usage records on real Postgres with the real migrated schema (needs Docker)."""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ember.adapters.ai.errors import AiProviderError
from ember.adapters.ai.fake import FakeAiProvider
from ember.adapters.ai.gateway import AiGateway
from ember.adapters.ai.interface import PromptRef
from ember.adapters.ai.models import AiUsage
from ember.adapters.ai.usage import AiUsageRepository, DbUsageRecorder, UsageRecord
from ember.core.db import transaction
from ember.core.events import InProcessEventBus
from ember.core.tenancy import TenantContext
from tests.adapters.ai.conftest import MESSAGES, REPLY, make_config
from tests.tenant_isolation import assert_tenant_isolation

pytestmark = pytest.mark.integration

Factory = async_sessionmaker[AsyncSession]


def gateway_on(session_factory: Factory, provider: FakeAiProvider) -> AiGateway:
    return AiGateway(
        config=make_config(),
        providers={"fake": provider},
        recorder=DbUsageRecorder(session_factory),
    )


async def usage_rows(session_factory: Factory, tenant_id: uuid.UUID) -> list[AiUsage]:
    with TenantContext.use(tenant_id):
        async with session_factory() as session:
            return (await AiUsageRepository(session).list()).items


async def test_streaming_through_the_gateway_stores_the_usage_record(
    session_factory: Factory,
) -> None:
    tenant_id = uuid.uuid4()
    gateway = gateway_on(session_factory, FakeAiProvider(reply=REPLY))

    with TenantContext.use(tenant_id):
        pieces = [
            piece
            async for piece in gateway.stream(
                task="answer", messages=MESSAGES, prompt=PromptRef(name="live_answer", version=1)
            )
        ]

    assert "".join(pieces) == REPLY
    (row,) = await usage_rows(session_factory, tenant_id)
    assert row.tenant_id == tenant_id
    assert (row.task, row.operation, row.provider, row.model) == (
        "answer",
        "stream",
        "fake",
        "chat",
    )
    assert row.status == "ok"
    assert (row.input_tokens, row.output_tokens) == (6, 5)
    assert row.cost_usd == Decimal("16")
    assert row.latency_ms >= 0
    assert row.first_token_ms is not None
    assert row.first_token_ms <= row.latency_ms
    assert row.is_fallback is False
    assert (row.prompt_name, row.prompt_version) == ("live_answer", 1)
    assert row.error_type is None


async def test_a_failed_attempt_and_its_fallback_are_both_stored(session_factory: Factory) -> None:
    tenant_id = uuid.uuid4()
    provider = FakeAiProvider(reply=REPLY)
    provider.fail_next(AiProviderError())
    gateway = gateway_on(session_factory, provider)

    with TenantContext.use(tenant_id):
        result = await gateway.complete(task="answer", messages=MESSAGES)

    assert result.used_fallback is True
    rows = await usage_rows(session_factory, tenant_id)
    assert [(r.model, r.status, r.is_fallback, r.error_type) for r in rows] == [
        ("chat", "error", False, "AiProviderError"),
        ("backup", "ok", True, None),
    ]
    assert [r.cost_usd for r in rows] == [Decimal(0), Decimal("8")]


async def test_usage_is_kept_even_when_the_request_that_made_the_call_rolls_back(
    session_factory: Factory,
) -> None:
    # The tokens were spent whatever happens to the request's own transaction.
    tenant_id = uuid.uuid4()
    gateway = gateway_on(session_factory, FakeAiProvider(reply=REPLY))

    with TenantContext.use(tenant_id), pytest.raises(RuntimeError, match="request failed"):
        async with transaction(session_factory, InProcessEventBus()):
            await gateway.complete(task="answer", messages=MESSAGES)
            raise RuntimeError("request failed after the AI call")

    (row,) = await usage_rows(session_factory, tenant_id)
    assert row.status == "ok"


async def test_each_tenant_only_sees_its_own_usage(session_factory: Factory) -> None:
    gateway = gateway_on(session_factory, FakeAiProvider(reply=REPLY))
    tenant_a, tenant_b = uuid.uuid4(), uuid.uuid4()
    for tenant_id, calls in ((tenant_a, 2), (tenant_b, 1)):
        with TenantContext.use(tenant_id):
            for _ in range(calls):
                await gateway.complete(task="plain", messages=MESSAGES)

    assert len(await usage_rows(session_factory, tenant_a)) == 2
    assert len(await usage_rows(session_factory, tenant_b)) == 1


async def test_a_cost_is_stored_without_losing_precision(session_factory: Factory) -> None:
    tenant_id = uuid.uuid4()
    record = UsageRecord(
        tenant_id=tenant_id,
        task="t",
        operation="embed",
        provider="p",
        model="m",
        status="ok",
        input_tokens=1,
        output_tokens=0,
        cost_usd=Decimal("0.00000002"),
        latency_ms=1,
        first_token_ms=None,
        is_fallback=False,
    )

    await DbUsageRecorder(session_factory).record(record)

    (row,) = await usage_rows(session_factory, tenant_id)
    assert row.cost_usd == Decimal("0.00000002")


async def test_the_usage_repository_is_tenant_isolated(session_factory: Factory) -> None:
    await assert_tenant_isolation(
        session_factory,
        AiUsageRepository,
        lambda: AiUsage(
            task="t",
            operation="complete",
            provider="p",
            model="m",
            status="ok",
            input_tokens=1,
            output_tokens=1,
            cost_usd=Decimal(1),
            latency_ms=1,
            is_fallback=False,
        ),
        {"status": "error"},
    )
