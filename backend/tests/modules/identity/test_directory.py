"""Sign-in resolution against real Postgres, up to a full Entra token through the real app."""

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ember.core.config import AuthSettings, DbSettings
from ember.core.security import EntraIdentity, Role, build_authenticator
from ember.core.tenancy import TenantContext
from ember.entrypoints.api import create_app
from ember.modules.identity.models import User, UserStatus
from ember.modules.identity.public import IdentityUserDirectory
from ember.modules.identity.repository import UserRepository
from tests.conftest import make_settings
from tests.core.test_security import AUDIENCE, ENTRA_TENANT, FakeJwksServer, bearer, entra_token
from tests.modules.identity.conftest import seed_tenant, user_spec

pytestmark = pytest.mark.integration

Factory = async_sessionmaker[AsyncSession]


async def _stored_user(
    session_factory: Factory, tenant_id: uuid.UUID, user_id: uuid.UUID
) -> User | None:
    with TenantContext.use(tenant_id):
        async with session_factory() as session:
            return await UserRepository(session).get(user_id)


async def test_first_sign_in_links_the_invited_user_and_saves_it(session_factory: Factory) -> None:
    seeded = await seed_tenant(
        session_factory,
        "A",
        {"admin": user_spec("admin@a.test", Role.ADMIN, status="invited")},
        entra_tenant_id="dir-1",
    )
    directory = IdentityUserDirectory(session_factory)

    resolved = await directory.resolve(EntraIdentity("dir-1", "oid-1", "Admin@A.test"))

    assert resolved is not None
    assert resolved.user_id == seeded.users["admin"]
    assert resolved.tenant_id == seeded.tenant_id
    assert resolved.roles == {Role.ADMIN}
    stored = await _stored_user(session_factory, seeded.tenant_id, seeded.users["admin"])
    assert stored is not None
    assert (stored.status, stored.entra_object_id) == (UserStatus.ACTIVE, "oid-1")


async def test_later_sign_ins_need_only_the_object_id(session_factory: Factory) -> None:
    seeded = await seed_tenant(
        session_factory,
        "A",
        {"rep": user_spec("rep@a.test", Role.REP, entra_object_id="oid-1")},
        entra_tenant_id="dir-1",
    )

    resolved = await IdentityUserDirectory(session_factory).resolve(EntraIdentity("dir-1", "oid-1"))

    assert resolved is not None
    assert resolved.user_id == seeded.users["rep"]


async def test_an_unknown_directory_or_person_is_nobody(session_factory: Factory) -> None:
    await seed_tenant(
        session_factory,
        "A",
        {"rep": user_spec("rep@a.test", status="invited")},
        entra_tenant_id="dir-1",
    )
    directory = IdentityUserDirectory(session_factory)

    assert await directory.resolve(EntraIdentity("dir-404", "oid-1", "rep@a.test")) is None
    assert await directory.resolve(EntraIdentity("dir-1", "oid-9", "stranger@a.test")) is None
    assert await directory.resolve(EntraIdentity("dir-1", "oid-9", None)) is None


async def test_a_disabled_user_cannot_sign_in(session_factory: Factory) -> None:
    await seed_tenant(
        session_factory,
        "A",
        {"gone": user_spec("gone@a.test", status="disabled", entra_object_id="oid-1")},
        entra_tenant_id="dir-1",
    )

    assert (
        await IdentityUserDirectory(session_factory).resolve(EntraIdentity("dir-1", "oid-1"))
        is None
    )


async def test_a_matching_email_cannot_take_over_a_linked_account(session_factory: Factory) -> None:
    seeded = await seed_tenant(
        session_factory,
        "A",
        {"owner": user_spec("owner@a.test", entra_object_id="oid-owner")},
        entra_tenant_id="dir-1",
    )

    stolen = await IdentityUserDirectory(session_factory).resolve(
        EntraIdentity("dir-1", "oid-attacker", "owner@a.test")
    )

    assert stolen is None
    stored = await _stored_user(session_factory, seeded.tenant_id, seeded.users["owner"])
    assert stored is not None
    assert stored.entra_object_id == "oid-owner"


async def test_the_same_email_in_two_tenants_links_only_in_the_signing_in_tenant(
    session_factory: Factory,
) -> None:
    a = await seed_tenant(
        session_factory,
        "A",
        {"u": user_spec("twin@x.test", status="invited")},
        entra_tenant_id="dir-a",
    )
    b = await seed_tenant(
        session_factory,
        "B",
        {"u": user_spec("twin@x.test", status="invited")},
        entra_tenant_id="dir-b",
    )

    resolved = await IdentityUserDirectory(session_factory).resolve(
        EntraIdentity("dir-b", "oid-1", "twin@x.test")
    )

    assert resolved is not None
    assert resolved.tenant_id == b.tenant_id
    untouched = await _stored_user(session_factory, a.tenant_id, a.users["u"])
    assert untouched is not None
    assert (untouched.status, untouched.entra_object_id) == (UserStatus.INVITED, None)


async def test_an_entra_token_signs_an_invited_admin_in_end_to_end(
    session_factory: Factory, migrated_database_url: str
) -> None:
    seeded = await seed_tenant(
        session_factory,
        "Acme",
        {"admin": user_spec("ada@acme.test", Role.ADMIN, status="invited", display_name="Ada")},
        entra_tenant_id=ENTRA_TENANT,
    )
    app = create_app(make_settings(db=DbSettings(url=migrated_database_url)))  # type: ignore[arg-type]
    jwks = FakeJwksServer()
    app.state.authenticator = build_authenticator(
        make_settings(auth=AuthSettings(entra_tenant_id=ENTRA_TENANT, audience=AUDIENCE)),
        IdentityUserDirectory(app.state.session_factory),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(jwks.handle)),
    )
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get(
            "/api/v1/me",
            headers=bearer(entra_token(oid="oid-ada", preferred_username="Ada@Acme.test")),
        )
        # The token no longer needs to carry an email once the account is linked.
        later = await client.get("/api/v1/users", headers=bearer(entra_token(oid="oid-ada")))
        stranger = await client.get(
            "/api/v1/me",
            headers=bearer(entra_token(oid="oid-stranger", preferred_username="x@acme.test")),
        )

    assert first.status_code == 200
    assert first.json()["user"]["id"] == str(seeded.users["admin"])
    assert first.json()["user"]["status"] == "active"
    assert first.json()["tenant"]["name"] == "Acme"
    assert later.status_code == 200
    assert [u["email"] for u in later.json()["items"]] == ["ada@acme.test"]
    assert stranger.status_code == 403
