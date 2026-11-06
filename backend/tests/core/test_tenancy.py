import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import String
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import Mapped, mapped_column

from ember.core.config import DbSettings
from ember.core.db import create_engine, create_session_factory
from ember.core.errors import ValidationFailed
from ember.core.models import TenantModel
from ember.core.tenancy import (
    MAX_PAGE_LIMIT,
    TenantContext,
    TenantMismatch,
    TenantNotSet,
    TenantScopedRepository,
)
from tests.conftest import make_settings
from tests.tenant_isolation import assert_tenant_isolation


class Gadget(TenantModel):
    __tablename__ = "test_gadgets"

    name: Mapped[str] = mapped_column(String, nullable=False)


class GadgetRepository(TenantScopedRepository[Gadget]):
    model = Gadget


# --- TenantContext (no Docker) -------------------------------------------------


def test_context_starts_empty_and_require_raises() -> None:
    assert TenantContext.get() is None
    with pytest.raises(TenantNotSet):
        TenantContext.require()


def test_use_sets_and_restores_the_tenant() -> None:
    outer, inner = uuid.uuid4(), uuid.uuid4()

    with TenantContext.use(outer):
        assert TenantContext.require() == outer
        with TenantContext.use(inner):
            assert TenantContext.require() == inner
        assert TenantContext.require() == outer

    assert TenantContext.get() is None


def test_use_restores_the_tenant_when_the_block_raises() -> None:
    with pytest.raises(ValueError, match="boom"), TenantContext.use(uuid.uuid4()):
        raise ValueError("boom")

    assert TenantContext.get() is None


async def test_concurrent_tasks_do_not_share_a_tenant() -> None:
    seen: dict[str, uuid.UUID] = {}

    async def run(name: str) -> None:
        tenant = uuid.uuid4()
        with TenantContext.use(tenant):
            await asyncio.sleep(0.01)  # let the other task run while this tenant is set
            seen[name] = TenantContext.require()
            assert seen[name] == tenant

    await asyncio.gather(run("a"), run("b"))

    assert seen["a"] != seen["b"]


# --- repository against real Postgres (needs Docker) ---------------------------


@pytest.fixture
async def engine(database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(make_settings(db=DbSettings(url=database_url)))  # type: ignore[arg-type]
    async with engine.begin() as connection:
        await connection.run_sync(Gadget.__table__.create)
    yield engine
    await engine.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return create_session_factory(engine)


@pytest.mark.integration
async def test_tenant_a_cannot_read_change_or_delete_tenant_b_rows(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await assert_tenant_isolation(
        session_factory, GadgetRepository, lambda: Gadget(name="secret"), {"name": "changed"}
    )


@pytest.mark.integration
async def test_add_sets_the_current_tenant_and_get_returns_the_row(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    tenant = uuid.uuid4()
    with TenantContext.use(tenant):
        async with session_factory() as session:
            repository = GadgetRepository(session)
            added = await repository.add(Gadget(name="first"))
            await session.commit()

        async with session_factory() as session:
            found = await GadgetRepository(session).get(added.id)

    assert found is not None
    assert found.tenant_id == tenant
    assert found.name == "first"


@pytest.mark.integration
async def test_add_rejects_an_entity_of_another_tenant(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    with TenantContext.use(uuid.uuid4()):
        async with session_factory() as session:
            with pytest.raises(TenantMismatch):
                await GadgetRepository(session).add(Gadget(name="x", tenant_id=uuid.uuid4()))


@pytest.mark.integration
async def test_update_changes_columns_and_refuses_protected_ones(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    with TenantContext.use(uuid.uuid4()):
        async with session_factory() as session:
            repository = GadgetRepository(session)
            added = await repository.add(Gadget(name="before"))

            updated = await repository.update(added.id, {"name": "after"})
            assert updated is not None
            assert updated.name == "after"

            for protected in ("tenant_id", "id", "created_at"):
                with pytest.raises(ValueError, match="Cannot update"):
                    await repository.update(added.id, {protected: None})
            with pytest.raises(ValueError, match="Cannot update"):
                await repository.update(added.id, {"no_such_column": 1})


@pytest.mark.integration
async def test_delete_removes_the_row(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    with TenantContext.use(uuid.uuid4()):
        async with session_factory() as session:
            repository = GadgetRepository(session)
            added = await repository.add(Gadget(name="gone"))

            assert await repository.delete(added.id) is True
            assert await repository.get(added.id) is None
            assert await repository.delete(added.id) is False


async def _add_gadgets(
    session_factory: async_sessionmaker[AsyncSession], count: int
) -> list[uuid.UUID]:
    async with session_factory() as session:
        repository = GadgetRepository(session)
        ids = [(await repository.add(Gadget(name=f"g{i}"))).id for i in range(count)]
        await session.commit()
    return ids


@pytest.mark.integration
async def test_list_pages_through_every_row_once_in_a_stable_order(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    tenant = uuid.uuid4()
    with TenantContext.use(tenant):
        ids = await _add_gadgets(session_factory, 5)

        # Another tenant's rows must not leak into any page.
        with TenantContext.use(uuid.uuid4()):
            await _add_gadgets(session_factory, 3)

        seen: list[uuid.UUID] = []
        cursor: str | None = None
        page_sizes: list[int] = []
        async with session_factory() as session:
            repository = GadgetRepository(session)
            while True:
                page = await repository.list(cursor=cursor, limit=2)
                page_sizes.append(len(page.items))
                seen.extend(item.id for item in page.items)
                cursor = page.next_cursor
                if cursor is None:
                    break
            # Rows created in the same clock tick tie on created_at; id breaks the tie, so
            # paging must agree with one big page and never skip or repeat a row.
            everything = [item.id for item in (await repository.list(limit=MAX_PAGE_LIMIT)).items]

    assert page_sizes == [2, 2, 1]
    assert seen == everything
    assert sorted(seen) == sorted(ids)


@pytest.mark.integration
async def test_list_has_no_next_cursor_when_everything_fits(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    with TenantContext.use(uuid.uuid4()):
        await _add_gadgets(session_factory, 2)
        async with session_factory() as session:
            page = await GadgetRepository(session).list(limit=2)

    assert len(page.items) == 2
    assert page.next_cursor is None


@pytest.mark.integration
async def test_list_clamps_the_limit(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    with TenantContext.use(uuid.uuid4()):
        await _add_gadgets(session_factory, 3)
        async with session_factory() as session:
            repository = GadgetRepository(session)
            assert len((await repository.list(limit=0)).items) == 1
            assert len((await repository.list(limit=MAX_PAGE_LIMIT * 10)).items) == 3


@pytest.mark.integration
@pytest.mark.parametrize("cursor", ["not-a-cursor", "e30", "WzEsMl0", ""])
async def test_list_rejects_a_malformed_cursor(
    session_factory: async_sessionmaker[AsyncSession], cursor: str
) -> None:
    with TenantContext.use(uuid.uuid4()):
        async with session_factory() as session:
            with pytest.raises(ValidationFailed):
                await GadgetRepository(session).list(cursor=cursor)
