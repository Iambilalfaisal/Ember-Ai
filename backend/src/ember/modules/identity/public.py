"""The only file other modules (and entrypoints and scripts) may import from identity.

Everything here takes the caller's session: services never open their own and never commit.
ORM models are never exposed; callers get the DTOs below.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ember.core.security import AuthenticatedUser, EntraIdentity
from ember.modules.identity.schemas import TenantRead, TenantSettings, UserRead
from ember.modules.identity.service import IdentityService

__all__ = [
    "IdentityUserDirectory",
    "TenantRead",
    "TenantSettings",
    "UserRead",
    "create_tenant_with_admin",
    "get_tenant_settings",
    "get_user",
]


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> UserRead | None:
    """Return a user of the current tenant, or ``None`` if there is no such user.

    Raises:
        TenantNotSet: no current tenant (call inside a request or ``TenantContext.use``).
    """
    return await IdentityService.for_session(session).get_user(user_id)


async def get_tenant_settings(session: AsyncSession) -> TenantSettings:
    """Return the current tenant's settings.

    Raises:
        NotFound: the current tenant does not exist.
        TenantNotSet: no current tenant.
    """
    return await IdentityService.for_session(session).get_tenant_settings()


async def create_tenant_with_admin(
    session: AsyncSession,
    *,
    name: str,
    entra_tenant_id: str | None,
    admin_email: str,
    admin_display_name: str | None = None,
) -> tuple[TenantRead, UserRead]:
    """Create a tenant and an invited admin (bootstrap; the caller commits).

    Raises:
        Conflict: the Entra directory is already linked to another tenant.
    """
    return await IdentityService.for_session(session).create_tenant(
        name=name,
        entra_tenant_id=entra_tenant_id,
        admin_email=admin_email,
        admin_display_name=admin_display_name,
    )


class IdentityUserDirectory:
    """The ``UserDirectory`` that ``core.security`` uses to map a sign-in to a user.

    Sign-in resolution happens before a request has a session, so this opens a short one of its
    own and commits it: the first sign-in of an invited user links and activates them, and that
    must be saved even though the rest of the request is a separate transaction.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def resolve(self, identity: EntraIdentity) -> AuthenticatedUser | None:
        async with self._session_factory() as session:
            user = await IdentityService.for_session(session).resolve_identity(identity)
            await session.commit()
        return user
