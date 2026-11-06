"""Reusable proof that a repository never shows one tenant's rows to another.

AGENTS.md section 4 requires this for every repository. Call it from the repository's test::

    async def test_tenant_isolation(session_factory):
        await assert_tenant_isolation(
            session_factory, GadgetRepository, lambda: Gadget(name="x"), {"name": "changed"}
        )
"""

import uuid
from collections.abc import Callable, Mapping
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ember.core.tenancy import TenantContext, TenantNotSet


async def assert_tenant_isolation(
    session_factory: async_sessionmaker[AsyncSession],
    repository_class: Callable[[AsyncSession], Any],
    make_entity: Callable[[], Any],
    changes: Mapping[str, Any],
) -> None:
    """Create a row as tenant A, then check tenant B cannot see, change or delete it.

    Args:
        session_factory: sessions on a database where the repository's table exists.
        repository_class: the ``TenantScopedRepository`` subclass under test.
        make_entity: builds a new, unsaved row without a ``tenant_id``.
        changes: column values that are valid for ``update``.
    """
    tenant_a, tenant_b = uuid.uuid4(), uuid.uuid4()

    with TenantContext.use(tenant_a):
        async with session_factory() as session:
            created = await repository_class(session).add(make_entity())
            await session.commit()
            entity_id = created.id

    with TenantContext.use(tenant_b):
        async with session_factory() as session:
            repository = repository_class(session)
            assert await repository.get(entity_id) is None
            assert (await repository.list()).items == []
            assert await repository.update(entity_id, changes) is None
            assert await repository.delete(entity_id) is False
            await session.commit()

    # Tenant B's attempts changed nothing.
    with TenantContext.use(tenant_a):
        async with session_factory() as session:
            repository = repository_class(session)
            row = await repository.get(entity_id)
            assert row is not None
            assert row.tenant_id == tenant_a
            assert [r.id for r in (await repository.list()).items] == [entity_id]
            for key, value in changes.items():
                assert getattr(row, key) != value

    # No tenant at all is an error, never an unscoped read.
    async with session_factory() as session:
        repository = repository_class(session)
        with pytest.raises(TenantNotSet):
            await repository.get(entity_id)
        with pytest.raises(TenantNotSet):
            await repository.list()
