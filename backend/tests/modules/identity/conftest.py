import uuid
from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from ember.core.config import AuthSettings, DbSettings, Settings
from ember.core.db import create_engine, create_session_factory
from ember.core.security import Role, issue_dev_token
from ember.modules.identity.models import Tenant, User
from tests.conftest import make_settings

DEV_KEY = "identity-tests-dev-signing-key-0123456789"


@dataclass
class SeededTenant:
    tenant_id: uuid.UUID
    users: dict[str, uuid.UUID]


async def seed_tenant(
    session_factory: async_sessionmaker[AsyncSession],
    name: str,
    users: Mapping[str, Mapping[str, Any]],
    *,
    entra_tenant_id: str | None = None,
) -> SeededTenant:
    """Insert a tenant and users straight through the ORM (bypassing the service under test)."""
    async with session_factory() as session:
        tenant = Tenant(name=name, entra_tenant_id=entra_tenant_id)
        session.add(tenant)
        await session.flush()
        rows = {key: User(tenant_id=tenant.id, **spec) for key, spec in users.items()}
        session.add_all(rows.values())
        await session.commit()
        return SeededTenant(tenant.id, {key: row.id for key, row in rows.items()})


def user_spec(
    email: str,
    *roles: Role,
    status: str = "active",
    entra_object_id: str | None = None,
    display_name: str | None = None,
) -> dict[str, Any]:
    return {
        "email": email,
        "roles": [role.value for role in roles or (Role.REP,)],
        "status": status,
        "entra_object_id": entra_object_id,
        "display_name": display_name,
    }


@pytest.fixture
async def engine(migrated_database_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_engine(make_settings(db=DbSettings(url=migrated_database_url)))  # type: ignore[arg-type]
    yield engine
    await engine.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return create_session_factory(engine)


@pytest.fixture
def local_settings(migrated_database_url: str) -> Settings:
    """Settings for an API in ``local``, where dev tokens are accepted."""
    return make_settings(
        env="local",
        db=DbSettings(url=migrated_database_url),  # type: ignore[arg-type]
        auth=AuthSettings(dev_signing_key=DEV_KEY),  # type: ignore[arg-type]
    )


def dev_token(
    settings: Settings, user_id: uuid.UUID, tenant_id: uuid.UUID, *roles: Role
) -> dict[str, str]:
    """An ``Authorization`` header carrying a dev token for this user."""
    token = issue_dev_token(
        settings,
        user_id=user_id,
        tenant_id=tenant_id,
        roles=frozenset(roles),
        ttl=timedelta(hours=1),
    )
    return {"Authorization": f"Bearer {token}"}
