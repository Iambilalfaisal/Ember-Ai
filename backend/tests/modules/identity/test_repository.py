"""Repository tests against real Postgres with the real migrated schema (needs Docker)."""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ember.core.security import Role
from ember.core.tenancy import TenantContext
from ember.modules.identity.models import Tenant, User
from ember.modules.identity.repository import TenantRepository, UserRepository
from tests.modules.identity.conftest import seed_tenant, user_spec
from tests.tenant_isolation import assert_tenant_isolation

pytestmark = pytest.mark.integration

Factory = async_sessionmaker[AsyncSession]


async def test_tenant_a_cannot_read_change_or_delete_tenant_b_users(
    session_factory: Factory,
) -> None:
    a = await seed_tenant(session_factory, "A", {})
    b = await seed_tenant(session_factory, "B", {})

    await assert_tenant_isolation(
        session_factory,
        UserRepository,
        lambda: User(email="isolated@x.test", roles=["rep"], status="invited"),
        {"display_name": "changed"},
        tenant_ids=(a.tenant_id, b.tenant_id),
    )


async def test_lookups_by_email_and_object_id_are_scoped_to_the_current_tenant(
    session_factory: Factory,
) -> None:
    a = await seed_tenant(
        session_factory, "A", {"u": user_spec("twin@x.test", entra_object_id="oid-twin")}
    )
    b = await seed_tenant(
        session_factory, "B", {"u": user_spec("twin@x.test", entra_object_id="oid-twin")}
    )

    for seeded in (a, b):
        with TenantContext.use(seeded.tenant_id):
            async with session_factory() as session:
                repository = UserRepository(session)
                by_email = await repository.get_by_email("twin@x.test")
                by_oid = await repository.get_by_entra_object_id("oid-twin")
                nobody = await repository.get_by_email("nobody@x.test")
        assert by_email is not None
        assert by_oid is not None
        assert by_email.id == by_oid.id == seeded.users["u"]
        assert nobody is None


async def test_roles_are_stored_as_a_list(session_factory: Factory) -> None:
    seeded = await seed_tenant(
        session_factory, "A", {"u": user_spec("multi@x.test", Role.REP, Role.TEAM_LEAD)}
    )

    with TenantContext.use(seeded.tenant_id):
        async with session_factory() as session:
            user = await UserRepository(session).get(seeded.users["u"])

    assert user is not None
    assert user.roles == ["rep", "team_lead"]


async def test_an_email_is_unique_within_a_tenant(session_factory: Factory) -> None:
    seeded = await seed_tenant(session_factory, "A", {"u": user_spec("dup@x.test")})

    with TenantContext.use(seeded.tenant_id):
        async with session_factory() as session:
            with pytest.raises(IntegrityError):
                await UserRepository(session).add(
                    User(email="dup@x.test", roles=["rep"], status="invited")
                )


async def test_an_entra_object_id_is_unique_within_a_tenant(session_factory: Factory) -> None:
    seeded = await seed_tenant(
        session_factory, "A", {"u": user_spec("one@x.test", entra_object_id="oid-1")}
    )

    with TenantContext.use(seeded.tenant_id):
        async with session_factory() as session:
            with pytest.raises(IntegrityError):
                await UserRepository(session).add(
                    User(
                        email="two@x.test",
                        roles=["rep"],
                        status="active",
                        entra_object_id="oid-1",
                    )
                )


async def test_a_user_needs_an_existing_tenant(session_factory: Factory) -> None:
    async with session_factory() as session:
        session.add(
            User(tenant_id=uuid.uuid4(), email="orphan@x.test", roles=["rep"], status="active")
        )
        with pytest.raises(IntegrityError):
            await session.flush()


async def test_status_is_restricted_to_known_values(session_factory: Factory) -> None:
    seeded = await seed_tenant(session_factory, "A", {})

    with TenantContext.use(seeded.tenant_id):
        async with session_factory() as session:
            with pytest.raises(IntegrityError):
                await UserRepository(session).add(
                    User(email="odd@x.test", roles=["rep"], status="vanished")
                )


async def test_tenants_are_found_by_id_and_by_entra_directory(session_factory: Factory) -> None:
    seeded = await seed_tenant(session_factory, "A", {}, entra_tenant_id="dir-1")
    await seed_tenant(session_factory, "B", {}, entra_tenant_id="dir-2")

    async with session_factory() as session:
        repository = TenantRepository(session)
        by_id = await repository.get(seeded.tenant_id)
        by_directory = await repository.get_by_entra_tenant_id("dir-1")
        unknown = await repository.get_by_entra_tenant_id("dir-404")

    assert by_id is not None
    assert by_directory is not None
    assert by_id.id == by_directory.id == seeded.tenant_id
    assert by_id.settings == {}
    assert unknown is None


async def test_an_entra_directory_belongs_to_one_tenant(session_factory: Factory) -> None:
    await seed_tenant(session_factory, "A", {}, entra_tenant_id="dir-1")

    async with session_factory() as session:
        with pytest.raises(IntegrityError):
            await TenantRepository(session).add(Tenant(name="Dup", entra_tenant_id="dir-1"))


async def test_tenants_without_an_entra_directory_can_coexist(session_factory: Factory) -> None:
    await seed_tenant(session_factory, "Local one", {})
    await seed_tenant(session_factory, "Local two", {})
