"""Database access of the identity module. No business logic."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ember.core.tenancy import TenantScopedRepository
from ember.modules.identity.models import Tenant, User


class TenantRepository:
    """Access to ``tenants``.

    Not tenant-scoped, on purpose: this table is the registry the tenant scope itself comes from
    (a sign-in finds its tenant here before any tenant is set). Every other table goes through a
    ``TenantScopedRepository``.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, tenant_id: uuid.UUID) -> Tenant | None:
        return await self.session.get(Tenant, tenant_id)

    async def get_by_entra_tenant_id(self, entra_tenant_id: str) -> Tenant | None:
        result = await self.session.execute(
            select(Tenant).where(Tenant.entra_tenant_id == entra_tenant_id)
        )
        return result.scalar_one_or_none()

    async def add(self, tenant: Tenant) -> Tenant:
        self.session.add(tenant)
        await self.session.flush()
        return tenant


class UserRepository(TenantScopedRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        """Return the current tenant's user with this (already lower-cased) email."""
        result = await self.session.execute(self._scoped().where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_entra_object_id(self, entra_object_id: str) -> User | None:
        """Return the current tenant's user linked to this Entra object id."""
        result = await self.session.execute(
            self._scoped().where(User.entra_object_id == entra_object_id)
        )
        return result.scalar_one_or_none()
