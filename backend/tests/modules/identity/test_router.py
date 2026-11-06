"""Route tests: the real app, real Postgres with the migrated schema, dev tokens (needs Docker)."""

from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ember.core.config import Settings
from ember.core.security import Role
from ember.entrypoints.api import create_app
from tests.modules.identity.conftest import SeededTenant, dev_token, seed_tenant, user_spec

pytestmark = pytest.mark.integration


@dataclass
class Scenario:
    a: SeededTenant
    b: SeededTenant
    settings: Settings
    client: httpx.AsyncClient

    def as_user(self, tenant: SeededTenant, key: str, *roles: Role) -> dict[str, str]:
        return dev_token(self.settings, tenant.users[key], tenant.tenant_id, *roles)


@pytest.fixture
async def scenario(
    session_factory: async_sessionmaker[AsyncSession], local_settings: Settings
) -> AsyncIterator[Scenario]:
    a = await seed_tenant(
        session_factory,
        "Acme",
        {
            "admin": user_spec("admin@a.test", Role.ADMIN, display_name="Ada"),
            "lead": user_spec("lead@a.test", Role.TEAM_LEAD),
            "rep": user_spec("rep@a.test", Role.REP),
        },
    )
    b = await seed_tenant(
        session_factory,
        "Beta",
        {"admin": user_spec("admin@b.test", Role.ADMIN), "rep": user_spec("rep@b.test", Role.REP)},
    )
    transport = httpx.ASGITransport(app=create_app(local_settings), raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield Scenario(a, b, local_settings, client)


def assert_problem(response: httpx.Response, status: int, type_suffix: str) -> None:
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["type"] == f"urn:ember:problem:{type_suffix}"


# --- GET /api/v1/me ------------------------------------------------------------------


async def test_me_returns_the_signed_in_user_and_their_tenant(scenario: Scenario) -> None:
    headers = scenario.as_user(scenario.a, "admin", Role.ADMIN)

    response = await scenario.client.get("/api/v1/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["id"] == str(scenario.a.users["admin"])
    assert body["user"]["email"] == "admin@a.test"
    assert body["user"]["display_name"] == "Ada"
    assert body["user"]["roles"] == ["admin"]
    assert body["user"]["status"] == "active"
    assert body["tenant"]["id"] == str(scenario.a.tenant_id)
    assert body["tenant"]["name"] == "Acme"
    assert body["tenant"]["settings"] == {"timezone": "UTC"}


async def test_me_works_for_every_role(scenario: Scenario) -> None:
    for key, role in (("admin", Role.ADMIN), ("lead", Role.TEAM_LEAD), ("rep", Role.REP)):
        response = await scenario.client.get(
            "/api/v1/me", headers=scenario.as_user(scenario.a, key, role)
        )
        assert response.status_code == 200
        assert response.json()["user"]["roles"] == [role.value]


async def test_me_without_a_token_is_401(scenario: Scenario) -> None:
    response = await scenario.client.get("/api/v1/me")

    assert_problem(response, 401, "unauthorized")


async def test_me_for_a_token_without_a_user_record_is_404(scenario: Scenario) -> None:
    ghost = dev_token(
        scenario.settings, scenario.b.users["rep"], scenario.a.tenant_id, Role.REP
    )  # a real user id, but not of this tenant

    response = await scenario.client.get("/api/v1/me", headers=ghost)

    assert_problem(response, 404, "not-found")


# --- GET /api/v1/users ---------------------------------------------------------------


async def test_admin_lists_only_their_own_tenants_users(scenario: Scenario) -> None:
    response = await scenario.client.get(
        "/api/v1/users", headers=scenario.as_user(scenario.a, "admin", Role.ADMIN)
    )

    assert response.status_code == 200
    body = response.json()
    assert {user["email"] for user in body["items"]} == {
        "admin@a.test",
        "lead@a.test",
        "rep@a.test",
    }
    assert body["next_cursor"] is None
    # Internal columns are not part of the response.
    assert set(body["items"][0]) == {"id", "email", "display_name", "roles", "status", "created_at"}


async def test_another_tenants_admin_sees_their_own_users_only(scenario: Scenario) -> None:
    response = await scenario.client.get(
        "/api/v1/users", headers=scenario.as_user(scenario.b, "admin", Role.ADMIN)
    )

    assert {user["email"] for user in response.json()["items"]} == {"admin@b.test", "rep@b.test"}


@pytest.mark.parametrize(("key", "role"), [("lead", Role.TEAM_LEAD), ("rep", Role.REP)])
async def test_listing_users_needs_the_admin_role(scenario: Scenario, key: str, role: Role) -> None:
    response = await scenario.client.get(
        "/api/v1/users", headers=scenario.as_user(scenario.a, key, role)
    )

    assert_problem(response, 403, "forbidden")


async def test_listing_users_without_a_token_is_401(scenario: Scenario) -> None:
    assert_problem(await scenario.client.get("/api/v1/users"), 401, "unauthorized")


async def test_users_are_paged_with_a_cursor(scenario: Scenario) -> None:
    headers = scenario.as_user(scenario.a, "admin", Role.ADMIN)

    first = (await scenario.client.get("/api/v1/users?limit=2", headers=headers)).json()
    second = (
        await scenario.client.get(
            f"/api/v1/users?limit=2&cursor={first['next_cursor']}", headers=headers
        )
    ).json()

    assert len(first["items"]) == 2
    assert first["next_cursor"] is not None
    assert len(second["items"]) == 1
    assert second["next_cursor"] is None
    ids = [user["id"] for user in first["items"] + second["items"]]
    assert sorted(ids) == sorted(str(i) for i in scenario.a.users.values())


@pytest.mark.parametrize("query", ["limit=0", "limit=201", "limit=abc", "cursor=not-a-cursor"])
async def test_bad_paging_parameters_are_422(scenario: Scenario, query: str) -> None:
    response = await scenario.client.get(
        f"/api/v1/users?{query}", headers=scenario.as_user(scenario.a, "admin", Role.ADMIN)
    )

    assert_problem(response, 422, "validation-failed")


# --- POST /api/v1/users --------------------------------------------------------------


async def test_admin_invites_a_user(scenario: Scenario) -> None:
    headers = scenario.as_user(scenario.a, "admin", Role.ADMIN)

    response = await scenario.client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "email": "  New.Person@A.test ",
            "display_name": "New Person",
            "roles": ["rep", "rep"],
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["email"] == "new.person@a.test"
    assert created["display_name"] == "New Person"
    assert created["roles"] == ["rep"]
    assert created["status"] == "invited"
    listed = (await scenario.client.get("/api/v1/users", headers=headers)).json()["items"]
    assert created["id"] in {user["id"] for user in listed}


async def test_invited_user_belongs_to_the_inviting_admins_tenant_only(scenario: Scenario) -> None:
    await scenario.client.post(
        "/api/v1/users",
        headers=scenario.as_user(scenario.a, "admin", Role.ADMIN),
        json={"email": "only.in.a@x.test", "roles": ["rep"]},
    )

    in_b = (
        await scenario.client.get(
            "/api/v1/users", headers=scenario.as_user(scenario.b, "admin", Role.ADMIN)
        )
    ).json()["items"]

    assert "only.in.a@x.test" not in {user["email"] for user in in_b}


async def test_inviting_an_existing_email_is_409(scenario: Scenario) -> None:
    response = await scenario.client.post(
        "/api/v1/users",
        headers=scenario.as_user(scenario.a, "admin", Role.ADMIN),
        json={"email": "REP@a.test", "roles": ["rep"]},
    )

    assert_problem(response, 409, "conflict")


async def test_the_same_email_can_be_invited_in_another_tenant(scenario: Scenario) -> None:
    response = await scenario.client.post(
        "/api/v1/users",
        headers=scenario.as_user(scenario.b, "admin", Role.ADMIN),
        json={"email": "rep@a.test", "roles": ["rep"]},
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    "body",
    [
        {"email": "not an email", "roles": ["rep"]},
        {"email": "ok@x.test", "roles": []},
        {"email": "ok@x.test", "roles": ["superuser"]},
        {"email": "ok@x.test"},
        {"roles": ["rep"]},
    ],
)
async def test_invalid_invitations_are_422_and_do_not_echo_the_input(
    scenario: Scenario, body: dict[str, object]
) -> None:
    response = await scenario.client.post(
        "/api/v1/users", headers=scenario.as_user(scenario.a, "admin", Role.ADMIN), json=body
    )

    assert_problem(response, 422, "validation-failed")
    assert "not an email" not in response.text
    assert "superuser" not in response.text


@pytest.mark.parametrize(("key", "role"), [("lead", Role.TEAM_LEAD), ("rep", Role.REP)])
async def test_inviting_users_needs_the_admin_role_and_creates_nothing_otherwise(
    scenario: Scenario, key: str, role: Role
) -> None:
    response = await scenario.client.post(
        "/api/v1/users",
        headers=scenario.as_user(scenario.a, key, role),
        json={"email": "blocked@a.test", "roles": ["admin"]},
    )

    assert_problem(response, 403, "forbidden")
    listed = (
        await scenario.client.get(
            "/api/v1/users", headers=scenario.as_user(scenario.a, "admin", Role.ADMIN)
        )
    ).json()["items"]
    assert "blocked@a.test" not in {user["email"] for user in listed}


async def test_inviting_without_a_token_is_401(scenario: Scenario) -> None:
    response = await scenario.client.post(
        "/api/v1/users", json={"email": "x@y.test", "roles": ["rep"]}
    )

    assert_problem(response, 401, "unauthorized")


# --- wiring ---------------------------------------------------------------------------


async def test_module_routes_are_mounted_under_api_v1(scenario: Scenario) -> None:
    spec = (await scenario.client.get("/api/v1/openapi.json")).json()

    assert {"/api/v1/me", "/api/v1/users"} <= set(spec["paths"])
    assert set(spec["paths"]["/api/v1/users"]) == {"get", "post"}
