"""Service tests with fake repositories: no database, no Docker."""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from ember.core.errors import Conflict, NotFound
from ember.core.observability import configure_logging
from ember.core.security import EntraIdentity, Role
from ember.core.tenancy import Page, TenantContext, TenantNotSet
from ember.modules.identity.models import Tenant, User, UserStatus
from ember.modules.identity.schemas import InviteUser
from ember.modules.identity.service import IdentityService
from tests.conftest import make_settings

ENTRA = "entra-dir-1"


class FakeTenantRepository:
    def __init__(self) -> None:
        self.tenants: dict[uuid.UUID, Tenant] = {}

    async def get(self, tenant_id: uuid.UUID) -> Tenant | None:
        return self.tenants.get(tenant_id)

    async def get_by_entra_tenant_id(self, entra_tenant_id: str) -> Tenant | None:
        return next(
            (t for t in self.tenants.values() if t.entra_tenant_id == entra_tenant_id), None
        )

    async def add(self, tenant: Tenant) -> Tenant:
        tenant.id = tenant.id or uuid.uuid4()
        tenant.settings = tenant.settings or {}
        self.tenants[tenant.id] = tenant
        return tenant


class FakeUserRepository:
    """Filters by the current tenant like the real one, so isolation mistakes show up here."""

    def __init__(self) -> None:
        self.users: dict[uuid.UUID, User] = {}
        self.fail_add_with: Exception | None = None

    def _mine(self) -> list[User]:
        tenant_id = TenantContext.require()
        return [u for u in self.users.values() if u.tenant_id == tenant_id]

    async def get(self, entity_id: uuid.UUID) -> User | None:
        return next((u for u in self._mine() if u.id == entity_id), None)

    async def get_by_email(self, email: str) -> User | None:
        return next((u for u in self._mine() if u.email == email), None)

    async def get_by_entra_object_id(self, entra_object_id: str) -> User | None:
        return next((u for u in self._mine() if u.entra_object_id == entra_object_id), None)

    async def list(self, *, cursor: str | None = None, limit: int = 50) -> Page[User]:
        self.last_list_args = (cursor, limit)
        return Page(items=self._mine(), next_cursor="next-page")

    async def add(self, user: User) -> User:
        if self.fail_add_with is not None:
            raise self.fail_add_with
        user.id = user.id or uuid.uuid4()
        user.tenant_id = TenantContext.require()
        user.created_at = datetime.now(UTC)
        self.users[user.id] = user
        return user

    async def update(self, entity_id: uuid.UUID, values: dict[str, Any]) -> User | None:
        user = await self.get(entity_id)
        if user is not None:
            for key, value in values.items():
                setattr(user, key, value)
        return user


class World:
    def __init__(self) -> None:
        self.tenants = FakeTenantRepository()
        self.users = FakeUserRepository()
        self.service = IdentityService(self.tenants, self.users)  # type: ignore[arg-type]

    async def tenant(self, name: str = "Acme", entra: str | None = ENTRA) -> Tenant:
        return await self.tenants.add(Tenant(name=name, entra_tenant_id=entra))

    async def user(
        self,
        tenant: Tenant,
        email: str,
        *roles: Role,
        status: UserStatus = UserStatus.ACTIVE,
        oid: str | None = None,
    ) -> User:
        with TenantContext.use(tenant.id):
            return await self.users.add(
                User(
                    email=email,
                    roles=[r.value for r in roles or (Role.REP,)],
                    status=status.value,
                    entra_object_id=oid,
                )
            )


@pytest.fixture
def world() -> World:
    return World()


def invite(email: str = "new@acme.test", *roles: Role, name: str | None = None) -> InviteUser:
    return InviteUser(email=email, display_name=name, roles=list(roles or (Role.REP,)))


# --- invite_user ----------------------------------------------------------------


async def test_invite_creates_an_invited_user_in_the_current_tenant(world: World) -> None:
    tenant = await world.tenant()

    with TenantContext.use(tenant.id):
        created = await world.service.invite_user(invite("New@Acme.test", Role.REP, Role.TEAM_LEAD))

    assert created.email == "new@acme.test"
    assert created.status == UserStatus.INVITED
    assert created.roles == [Role.REP, Role.TEAM_LEAD]
    assert world.users.users[created.id].tenant_id == tenant.id
    assert world.users.users[created.id].roles == ["rep", "team_lead"]


async def test_invite_rejects_a_duplicate_email_in_the_same_tenant(world: World) -> None:
    tenant = await world.tenant()
    await world.user(tenant, "taken@acme.test")

    with TenantContext.use(tenant.id), pytest.raises(Conflict):
        await world.service.invite_user(invite("taken@acme.test"))


async def test_the_same_email_can_be_invited_to_two_tenants(world: World) -> None:
    first, second = await world.tenant("A", "e1"), await world.tenant("B", "e2")
    await world.user(first, "shared@x.test")

    with TenantContext.use(second.id):
        created = await world.service.invite_user(invite("shared@x.test"))

    assert world.users.users[created.id].tenant_id == second.id


async def test_invite_turns_a_lost_race_into_a_conflict(world: World) -> None:
    tenant = await world.tenant()
    world.users.fail_add_with = IntegrityError("insert", {}, Exception("duplicate"))

    with TenantContext.use(tenant.id), pytest.raises(Conflict):
        await world.service.invite_user(invite())


async def test_invite_needs_a_tenant(world: World) -> None:
    with pytest.raises(TenantNotSet):
        await world.service.invite_user(invite())


def test_invite_normalises_and_validates_input() -> None:
    assert invite("  Mixed@Case.TEST ").email == "mixed@case.test"
    assert InviteUser(email="a@b.co", roles=[Role.REP, Role.REP]).roles == [Role.REP]
    for bad_email in ("no-at-sign", "a@b", "two@@x.test", "sp ace@x.test", "", "x@y.z" + "a" * 260):
        with pytest.raises(ValidationError):
            InviteUser(email=bad_email, roles=[Role.REP])
    with pytest.raises(ValidationError):
        InviteUser(email="a@b.co", roles=[])
    with pytest.raises(ValidationError):
        InviteUser(email="a@b.co", roles=["superuser"])  # type: ignore[list-item]


async def test_inviting_does_not_log_the_email(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(make_settings())
    world = World()
    tenant = await world.tenant()

    with TenantContext.use(tenant.id):
        await world.service.invite_user(invite("private.person@acme.test"))

    output = capsys.readouterr().out
    assert "identity.user_invited" in output
    assert "private.person" not in output


# --- reads ----------------------------------------------------------------------


async def test_get_user_returns_a_dto_or_none(world: World) -> None:
    tenant = await world.tenant()
    user = await world.user(tenant, "rep@acme.test", Role.REP)

    with TenantContext.use(tenant.id):
        found = await world.service.get_user(user.id)
        missing = await world.service.get_user(uuid.uuid4())

    assert found is not None
    assert (found.id, found.email, found.roles) == (user.id, "rep@acme.test", [Role.REP])
    assert missing is None


async def test_get_user_does_not_return_another_tenants_user(world: World) -> None:
    mine, theirs = await world.tenant("A", "e1"), await world.tenant("B", "e2")
    other = await world.user(theirs, "other@x.test")

    with TenantContext.use(mine.id):
        assert await world.service.get_user(other.id) is None


async def test_get_me_returns_user_and_tenant(world: World) -> None:
    tenant = await world.tenant("Acme")
    user = await world.user(tenant, "me@acme.test", Role.ADMIN)

    with TenantContext.use(tenant.id):
        me = await world.service.get_me(user.id)

    assert me.user.id == user.id
    assert (me.tenant.id, me.tenant.name) == (tenant.id, "Acme")
    assert me.tenant.settings.timezone == "UTC"


async def test_get_me_is_not_found_without_a_user_record(world: World) -> None:
    tenant = await world.tenant()

    with TenantContext.use(tenant.id), pytest.raises(NotFound):
        await world.service.get_me(uuid.uuid4())


async def test_tenant_settings_use_defaults_and_ignore_unknown_keys(world: World) -> None:
    tenant = await world.tenant()
    tenant.settings = {"timezone": "Europe/London", "left_over_from_a_removed_feature": 1}

    with TenantContext.use(tenant.id):
        settings = await world.service.get_tenant_settings()

    assert settings.timezone == "Europe/London"
    tenant.settings = {}
    with TenantContext.use(tenant.id):
        assert (await world.service.get_tenant_settings()).timezone == "UTC"


async def test_tenant_settings_for_a_missing_tenant_is_not_found(world: World) -> None:
    with TenantContext.use(uuid.uuid4()), pytest.raises(NotFound):
        await world.service.get_tenant_settings()


async def test_list_users_passes_paging_through_and_returns_dtos(world: World) -> None:
    tenant = await world.tenant()
    await world.user(tenant, "one@acme.test")

    with TenantContext.use(tenant.id):
        page = await world.service.list_users(cursor="abc", limit=7)

    assert world.users.last_list_args == ("abc", 7)
    assert [u.email for u in page.items] == ["one@acme.test"]
    assert page.next_cursor == "next-page"


# --- resolve_identity (sign-in) ---------------------------------------------------


def identity(oid: str = "oid-1", email: str | None = None, tid: str = ENTRA) -> EntraIdentity:
    return EntraIdentity(entra_tenant_id=tid, object_id=oid, email=email)


async def test_known_active_user_resolves_with_roles_from_the_database(world: World) -> None:
    tenant = await world.tenant()
    user = await world.user(tenant, "lead@acme.test", Role.TEAM_LEAD, Role.REP, oid="oid-1")

    resolved = await world.service.resolve_identity(identity("oid-1"))

    assert resolved is not None
    assert (resolved.user_id, resolved.tenant_id) == (user.id, tenant.id)
    assert resolved.roles == {Role.TEAM_LEAD, Role.REP}


async def test_unknown_entra_directory_resolves_to_nobody(world: World) -> None:
    tenant = await world.tenant()
    await world.user(tenant, "a@acme.test", oid="oid-1")

    assert await world.service.resolve_identity(identity("oid-1", tid="someone-elses")) is None


async def test_unknown_object_id_without_an_email_resolves_to_nobody(world: World) -> None:
    tenant = await world.tenant()
    await world.user(tenant, "a@acme.test", status=UserStatus.INVITED)

    assert await world.service.resolve_identity(identity("oid-new", email=None)) is None


async def test_disabled_user_is_refused(world: World) -> None:
    tenant = await world.tenant()
    await world.user(tenant, "gone@acme.test", status=UserStatus.DISABLED, oid="oid-1")

    assert await world.service.resolve_identity(identity("oid-1")) is None


async def test_first_sign_in_links_and_activates_the_invited_user(world: World) -> None:
    tenant = await world.tenant()
    invited = await world.user(
        tenant, "Invited@Acme.test".lower(), Role.ADMIN, status=UserStatus.INVITED
    )

    resolved = await world.service.resolve_identity(identity("oid-new", email="INVITED@acme.test"))

    assert resolved is not None
    assert resolved.user_id == invited.id
    assert (invited.entra_object_id, invited.status) == ("oid-new", UserStatus.ACTIVE)
    # From now on the object id alone is enough.
    again = await world.service.resolve_identity(identity("oid-new"))
    assert again is not None
    assert again.user_id == invited.id


async def test_an_email_match_never_takes_over_an_already_linked_user(world: World) -> None:
    tenant = await world.tenant()
    await world.user(tenant, "linked@acme.test", oid="oid-owner")

    assert (
        await world.service.resolve_identity(identity("oid-other", email="linked@acme.test"))
        is None
    )


async def test_first_sign_in_only_links_within_the_matching_tenant(world: World) -> None:
    mine, theirs = await world.tenant("A", ENTRA), await world.tenant("B", "other-dir")
    await world.user(theirs, "twin@x.test", status=UserStatus.INVITED)

    assert await world.service.resolve_identity(identity("oid-1", email="twin@x.test")) is None
    assert mine.id != theirs.id


# --- create_tenant (bootstrap) -----------------------------------------------------


async def test_create_tenant_makes_an_invited_admin(world: World) -> None:
    tenant, admin = await world.service.create_tenant(
        name="New Co",
        entra_tenant_id="dir-9",
        admin_email="Boss@NewCo.test",
        admin_display_name="Boss",
    )

    assert tenant.name == "New Co"
    assert admin.email == "boss@newco.test"
    assert admin.roles == [Role.ADMIN]
    assert admin.status == UserStatus.INVITED
    assert world.users.users[admin.id].tenant_id == tenant.id


async def test_create_tenant_refuses_an_entra_directory_that_is_already_linked(
    world: World,
) -> None:
    await world.tenant(entra="dir-9")

    with pytest.raises(Conflict):
        await world.service.create_tenant(name="Dup", entra_tenant_id="dir-9", admin_email="a@b.co")
