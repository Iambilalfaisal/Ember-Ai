"""Business logic of the identity module.

Services never commit and never import FastAPI. Emails are personal data: they are never
written to logs, only user and tenant ids.
"""

import uuid
from typing import Self

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ember.core.errors import Conflict, NotFound
from ember.core.events import EventBus
from ember.core.schemas import CursorPage
from ember.core.security import AuthenticatedUser, EntraIdentity, Role
from ember.core.tenancy import DEFAULT_PAGE_LIMIT, TenantContext
from ember.modules.identity.events import UserInvited
from ember.modules.identity.models import Tenant, User, UserStatus
from ember.modules.identity.repository import TenantRepository, UserRepository
from ember.modules.identity.schemas import (
    InviteUser,
    MeRead,
    TenantRead,
    TenantSettings,
    UserRead,
)

logger = structlog.get_logger(__name__)


class IdentityService:
    def __init__(self, tenants: TenantRepository, users: UserRepository, events: EventBus) -> None:
        self._tenants = tenants
        self._users = users
        self._events = events

    @classmethod
    def for_session(cls, session: AsyncSession, events: EventBus) -> Self:
        return cls(TenantRepository(session), UserRepository(session), events)

    async def get_user(self, user_id: uuid.UUID) -> UserRead | None:
        """Return a user of the current tenant, or ``None``.

        Args:
            user_id: id of the user.

        Raises:
            TenantNotSet: no current tenant.
        """
        user = await self._users.get(user_id)
        return UserRead.model_validate(user) if user else None

    async def get_tenant_settings(self) -> TenantSettings:
        """Return the settings of the current tenant.

        Raises:
            NotFound: the current tenant does not exist.
            TenantNotSet: no current tenant.
        """
        return (await self._current_tenant()).settings

    async def get_me(self, user_id: uuid.UUID) -> MeRead:
        """Return a user together with their tenant.

        Raises:
            NotFound: the user or the tenant does not exist.
        """
        user = await self.get_user(user_id)
        if user is None:
            raise NotFound("No user record exists for this sign-in.")
        return MeRead(user=user, tenant=await self._current_tenant())

    async def list_users(
        self, *, cursor: str | None = None, limit: int = DEFAULT_PAGE_LIMIT
    ) -> CursorPage[UserRead]:
        """Return one page of the current tenant's users, oldest first.

        Raises:
            ValidationFailed: the cursor is malformed.
        """
        page = await self._users.list(cursor=cursor, limit=limit)
        return CursorPage(
            items=[UserRead.model_validate(user) for user in page.items],
            next_cursor=page.next_cursor,
        )

    async def invite_user(self, request: InviteUser) -> UserRead:
        """Create an invited user in the current tenant.

        The user becomes active when they first sign in with the invited email. Publishes
        ``UserInvited``, delivered once the request's transaction commits.

        Raises:
            Conflict: a user with this email already exists in the tenant.
        """
        if await self._users.get_by_email(request.email) is not None:
            raise Conflict("A user with this email already exists.")
        user = User(
            email=request.email,
            display_name=request.display_name,
            roles=[role.value for role in request.roles],
            status=UserStatus.INVITED.value,
        )
        try:
            await self._users.add(user)
        except IntegrityError as exc:  # lost a race with a concurrent invite of the same email
            raise Conflict("A user with this email already exists.") from exc
        await self._events.publish(UserInvited(tenant_id=TenantContext.require(), user_id=user.id))
        logger.info("identity.user_invited", user_id=str(user.id))
        return UserRead.model_validate(user)

    async def resolve_identity(self, identity: EntraIdentity) -> AuthenticatedUser | None:
        """Map a verified Entra identity to an active Ember user, or ``None``.

        The tenant is found by the Entra directory id. The user is found by Entra object id;
        failing that, a still-invited user with the same email is linked to this object id and
        activated (first sign-in). A user already linked to someone else, or not active, is
        refused. Runs without a current tenant; it sets one while it looks users up.
        """
        tenant = await self._tenants.get_by_entra_tenant_id(identity.entra_tenant_id)
        if tenant is None:
            return None
        with TenantContext.use(tenant.id):
            user = await self._users.get_by_entra_object_id(identity.object_id)
            if user is None:
                user = await self._link_invited_user(identity)
            if user is None or user.status != UserStatus.ACTIVE:
                return None
            return AuthenticatedUser(
                user_id=user.id,
                tenant_id=user.tenant_id,
                roles=frozenset(Role(role) for role in user.roles),
            )

    async def create_tenant(
        self,
        *,
        name: str,
        entra_tenant_id: str | None,
        admin_email: str,
        admin_display_name: str | None = None,
    ) -> tuple[TenantRead, UserRead]:
        """Create a tenant and an invited admin who joins on first sign-in (bootstrap).

        Raises:
            Conflict: the Entra directory is already linked to another tenant.
        """
        tenant = Tenant(name=name, entra_tenant_id=entra_tenant_id)
        if (
            entra_tenant_id is not None
            and await self._tenants.get_by_entra_tenant_id(entra_tenant_id) is not None
        ):
            raise Conflict("This Entra directory is already linked to a tenant.")
        try:
            await self._tenants.add(tenant)
        except IntegrityError as exc:
            raise Conflict("This Entra directory is already linked to a tenant.") from exc
        with TenantContext.use(tenant.id):
            admin = await self.invite_user(
                InviteUser(email=admin_email, display_name=admin_display_name, roles=[Role.ADMIN])
            )
        logger.info("identity.tenant_created", tenant_id=str(tenant.id))
        return TenantRead.model_validate(tenant), admin

    async def _current_tenant(self) -> TenantRead:
        tenant = await self._tenants.get(TenantContext.require())
        if tenant is None:
            raise NotFound("The tenant does not exist.")
        return TenantRead.model_validate(tenant)

    async def _link_invited_user(self, identity: EntraIdentity) -> User | None:
        if not identity.email:
            return None
        invited = await self._users.get_by_email(identity.email.strip().lower())
        if (
            invited is None
            or invited.status != UserStatus.INVITED
            or invited.entra_object_id is not None
        ):
            return None
        linked = await self._users.update(
            invited.id,
            {"entra_object_id": identity.object_id, "status": UserStatus.ACTIVE.value},
        )
        logger.info("identity.user_linked", user_id=str(invited.id))
        return linked
