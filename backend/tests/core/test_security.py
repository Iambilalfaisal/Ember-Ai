import base64
import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Annotated, Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI
from pydantic import ValidationError

from ember.core.config import AuthSettings, Settings
from ember.core.security import (
    AuthConfigurationError,
    AuthenticatedUser,
    CurrentUser,
    DevAuthDisabled,
    EntraIdentity,
    JwksCache,
    JwksUnavailable,
    Role,
    build_authenticator,
    issue_dev_token,
    require_role,
)
from ember.core.tenancy import TenantContext
from ember.entrypoints.api import create_app
from tests.conftest import make_settings

ENTRA_TENANT = "5b1c7d0e-1111-4222-8333-444455556666"
AUDIENCE = "api://ember-test"
ISSUER = f"https://login.microsoftonline.com/{ENTRA_TENANT}/v2.0"
KEY_ID = "key-1"
DEV_KEY = "dev-signing-key-for-tests-only-0123456789"
OBJECT_ID = str(uuid.uuid4())
EMBER_TENANT = uuid.uuid4()
EMBER_USER = uuid.uuid4()


def _new_rsa_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


SIGNING_KEY = _new_rsa_key()
OTHER_KEY = _new_rsa_key()


def _jwk(private_key: rsa.RSAPrivateKey, kid: str) -> dict[str, Any]:
    document = jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    return {**document, "kid": kid, "use": "sig", "alg": "RS256"}


def entra_token(
    *,
    key: rsa.RSAPrivateKey = SIGNING_KEY,
    kid: str | None = KEY_ID,
    algorithm: str = "RS256",
    **claim_overrides: Any,
) -> str:
    claims: dict[str, Any] = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "tid": ENTRA_TENANT,
        "oid": OBJECT_ID,
        "exp": int(time.time()) + 3600,
    }
    claims.update(claim_overrides)
    claims = {name: value for name, value in claims.items() if value is not None}
    headers = {"kid": kid} if kid else {}
    return jwt.encode(claims, key, algorithm=algorithm, headers=headers)


@dataclass
class FakeJwksServer:
    keys: list[dict[str, Any]] = field(default_factory=lambda: [_jwk(SIGNING_KEY, KEY_ID)])
    requests: int = 0
    failing: bool = False

    def handle(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == f"/{ENTRA_TENANT}/discovery/v2.0/keys"
        self.requests += 1
        if self.failing:
            return httpx.Response(503)
        return httpx.Response(200, json={"keys": self.keys})


class FakeDirectory:
    def __init__(self, users: dict[tuple[str, str], AuthenticatedUser]) -> None:
        self.users = users
        self.last_identity: EntraIdentity | None = None

    async def resolve(self, identity: EntraIdentity) -> AuthenticatedUser | None:
        self.last_identity = identity
        return self.users.get((identity.entra_tenant_id, identity.object_id))


def _user(*roles: Role) -> AuthenticatedUser:
    return AuthenticatedUser(
        user_id=EMBER_USER, tenant_id=EMBER_TENANT, roles=frozenset(roles or {Role.REP})
    )


def _add_test_routes(app: FastAPI) -> None:
    @app.get("/test/me")
    async def me(user: CurrentUser) -> dict[str, Any]:
        return {
            "user_id": str(user.user_id),
            "tenant_id": str(user.tenant_id),
            "context_tenant_id": str(TenantContext.require()),
        }

    @app.get("/test/sync")
    def sync_me(user: CurrentUser) -> dict[str, str]:
        return {"context_tenant_id": str(TenantContext.require())}

    @app.get("/test/admin")
    async def admin_only(
        user: Annotated[AuthenticatedUser, Depends(require_role(Role.ADMIN))],
    ) -> dict[str, str]:
        return {"user_id": str(user.user_id)}

    @app.get("/test/leads")
    async def leads(
        user: Annotated[AuthenticatedUser, Depends(require_role(Role.TEAM_LEAD, Role.ADMIN))],
    ) -> dict[str, str]:
        return {"user_id": str(user.user_id)}


def _client(app: FastAPI) -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


@dataclass
class Harness:
    app: FastAPI
    jwks: FakeJwksServer
    directory: FakeDirectory

    def client(self) -> httpx.AsyncClient:
        return _client(self.app)


def _entra_settings(**auth: Any) -> Settings:
    return make_settings(auth=AuthSettings(entra_tenant_id=ENTRA_TENANT, audience=AUDIENCE, **auth))


@pytest.fixture
def harness() -> Harness:
    jwks = FakeJwksServer()
    directory = FakeDirectory({(ENTRA_TENANT, OBJECT_ID): _user(Role.REP)})
    app = create_app(make_settings())
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(jwks.handle))
    app.state.authenticator = build_authenticator(
        _entra_settings(), directory, http_client=http_client
    )
    _add_test_routes(app)
    return Harness(app=app, jwks=jwks, directory=directory)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def assert_unauthorized(response: httpx.Response) -> None:
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["type"] == "urn:ember:problem:unauthorized"


# --- Entra tokens ----------------------------------------------------------------


async def test_valid_token_returns_the_user_and_sets_the_tenant_context(
    harness: Harness,
) -> None:
    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(entra_token()))

    assert response.status_code == 200
    assert response.json() == {
        "user_id": str(EMBER_USER),
        "tenant_id": str(EMBER_TENANT),
        "context_tenant_id": str(EMBER_TENANT),
    }


async def test_tenant_context_is_visible_to_sync_routes_and_cleared_afterwards(
    harness: Harness,
) -> None:
    async with harness.client() as client:
        response = await client.get("/test/sync", headers=bearer(entra_token()))

    assert response.json() == {"context_tenant_id": str(EMBER_TENANT)}
    assert TenantContext.get() is None


async def test_tenant_context_is_cleared_after_a_failed_request(harness: Harness) -> None:
    async with harness.client() as client:
        await client.get("/test/admin", headers=bearer(entra_token()))  # 403: rep, not admin

    assert TenantContext.get() is None


async def test_tenant_comes_from_the_directory_not_from_the_token(harness: Harness) -> None:
    other_tenant = uuid.uuid4()
    harness.directory.users[(ENTRA_TENANT, OBJECT_ID)] = AuthenticatedUser(
        user_id=EMBER_USER, tenant_id=other_tenant, roles=frozenset({Role.REP})
    )

    async with harness.client() as client:
        response = await client.get(
            "/test/me", headers=bearer(entra_token(tenant_id=str(EMBER_TENANT)))
        )

    assert response.json()["context_tenant_id"] == str(other_tenant)


async def test_missing_authorization_header_is_401(harness: Harness) -> None:
    async with harness.client() as client:
        response = await client.get("/test/me")

    assert_unauthorized(response)


@pytest.mark.parametrize(
    "authorization", ["Basic dXNlcjpwdw==", "Bearer", "Bearer ", "Bearer not-a-jwt", "garbage"]
)
async def test_malformed_authorization_is_401(harness: Harness, authorization: str) -> None:
    async with harness.client() as client:
        response = await client.get("/test/me", headers={"Authorization": authorization})

    assert_unauthorized(response)


async def test_expired_token_is_401(harness: Harness) -> None:
    expired = entra_token(exp=int(time.time()) - 3600)

    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(expired))

    assert_unauthorized(response)


async def test_token_just_past_expiry_is_accepted_within_the_clock_skew(
    harness: Harness,
) -> None:
    barely_expired = entra_token(exp=int(time.time()) - 5)  # skew is 30 s by default

    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(barely_expired))

    assert response.status_code == 200


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "api://someone-else"},
        {"iss": "https://login.microsoftonline.com/other-tenant/v2.0"},
        {"tid": "other-tenant"},
        {"oid": None},
        {"exp": None},
        {"aud": None},
        {"iss": None},
        {"nbf": int(time.time()) + 3600},
    ],
    ids=["audience", "issuer", "tid", "no-oid", "no-exp", "no-aud", "no-iss", "not-yet-valid"],
)
async def test_token_with_wrong_or_missing_claims_is_401(
    harness: Harness, overrides: dict[str, Any]
) -> None:
    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(entra_token(**overrides)))

    assert_unauthorized(response)


async def test_token_signed_by_another_key_is_401(harness: Harness) -> None:
    forged = entra_token(key=OTHER_KEY)  # claims to be KEY_ID, but is not

    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(forged))

    assert_unauthorized(response)


@pytest.mark.parametrize("kid", ["unknown-key", None])
async def test_token_with_unknown_or_missing_key_id_is_401(
    harness: Harness, kid: str | None
) -> None:
    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(entra_token(kid=kid)))

    assert_unauthorized(response)


async def test_unsigned_token_is_401(harness: Harness) -> None:
    unsigned = jwt.encode(
        {"iss": ISSUER, "aud": AUDIENCE, "tid": ENTRA_TENANT, "oid": OBJECT_ID},
        key=None,
        algorithm="none",
        headers={"kid": KEY_ID},
    )

    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(unsigned))

    assert_unauthorized(response)


def _hs256_signed_with_public_key() -> str:
    """The classic algorithm-confusion token: HS256 with the RSA public key as the secret."""
    public_pem = SIGNING_KEY.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )

    def b64(data: bytes) -> bytes:
        return base64.urlsafe_b64encode(data).rstrip(b"=")

    header = b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": KEY_ID}).encode())
    payload = b64(
        json.dumps(
            {
                "iss": ISSUER,
                "aud": AUDIENCE,
                "tid": ENTRA_TENANT,
                "oid": OBJECT_ID,
                "exp": int(time.time()) + 3600,
            }
        ).encode()
    )
    signature = b64(hmac.new(public_pem, header + b"." + payload, hashlib.sha256).digest())
    return (header + b"." + payload + b"." + signature).decode()


async def test_algorithm_confusion_token_is_401(harness: Harness) -> None:
    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(_hs256_signed_with_public_key()))

    assert_unauthorized(response)


@pytest.mark.parametrize(
    ("claims", "expected_email"),
    [
        ({"email": "mail@x.test"}, "mail@x.test"),
        ({"preferred_username": "upn@x.test"}, "upn@x.test"),
        ({"email": "mail@x.test", "preferred_username": "upn@x.test"}, "mail@x.test"),
        ({"email": "", "preferred_username": "upn@x.test"}, "upn@x.test"),
        ({"email": 42}, None),
        ({}, None),
    ],
)
async def test_the_directory_gets_the_email_claim_when_there_is_one(
    harness: Harness, claims: dict[str, Any], expected_email: str | None
) -> None:
    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(entra_token(**claims)))

    assert response.status_code == 200
    assert harness.directory.last_identity == EntraIdentity(
        entra_tenant_id=ENTRA_TENANT, object_id=OBJECT_ID, email=expected_email
    )


async def test_valid_token_without_an_ember_account_is_403(harness: Harness) -> None:
    harness.directory.users.clear()

    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(entra_token()))

    assert response.status_code == 403
    assert response.json()["type"] == "urn:ember:problem:forbidden"


async def test_rejection_reason_is_logged_but_not_returned_and_token_is_not_logged(
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Build the app inside the test so its log handler binds to the captured stdout.
    jwks = FakeJwksServer()
    app = create_app(make_settings())
    app.state.authenticator = build_authenticator(
        _entra_settings(),
        FakeDirectory({}),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(jwks.handle)),
    )
    _add_test_routes(app)
    expired = entra_token(exp=int(time.time()) - 3600)

    async with _client(app) as client:
        response = await client.get("/test/me", headers=bearer(expired))

    output = capsys.readouterr().out
    assert '"reason": "expired"' in output
    assert expired not in output
    assert "expired" not in response.text


# --- roles ---------------------------------------------------------------------


async def test_user_without_the_required_role_is_403(harness: Harness) -> None:
    async with harness.client() as client:
        response = await client.get("/test/admin", headers=bearer(entra_token()))

    assert response.status_code == 403
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_user_with_the_required_role_is_allowed(harness: Harness) -> None:
    harness.directory.users[(ENTRA_TENANT, OBJECT_ID)] = _user(Role.ADMIN)

    async with harness.client() as client:
        response = await client.get("/test/admin", headers=bearer(entra_token()))

    assert response.status_code == 200


async def test_any_one_of_several_allowed_roles_is_enough(harness: Harness) -> None:
    async with harness.client() as client:
        statuses = {}
        for role in Role:
            harness.directory.users[(ENTRA_TENANT, OBJECT_ID)] = _user(role)
            response = await client.get("/test/leads", headers=bearer(entra_token()))
            statuses[role] = response.status_code

    assert statuses == {Role.REP: 403, Role.TEAM_LEAD: 200, Role.ADMIN: 200}


async def test_role_checked_route_without_a_token_is_401_not_403(harness: Harness) -> None:
    async with harness.client() as client:
        response = await client.get("/test/admin")

    assert_unauthorized(response)


def test_require_role_needs_a_role() -> None:
    with pytest.raises(ValueError, match="at least one role"):
        require_role()


# --- signing keys (JWKS) -----------------------------------------------------------


async def test_signing_keys_are_fetched_once_and_cached(harness: Harness) -> None:
    async with harness.client() as client:
        for _ in range(3):
            assert (await client.get("/test/me", headers=bearer(entra_token()))).status_code == 200

    assert harness.jwks.requests == 1


async def test_unreachable_signing_keys_are_503_not_401(harness: Harness) -> None:
    harness.jwks.failing = True

    async with harness.client() as client:
        response = await client.get("/test/me", headers=bearer(entra_token()))

    assert response.status_code == 503
    assert response.json()["type"] == "urn:ember:problem:upstream-unavailable"


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _cache(server: FakeJwksServer, clock: FakeClock) -> JwksCache:
    return JwksCache(
        f"https://login.microsoftonline.com/{ENTRA_TENANT}/discovery/v2.0/keys",
        httpx.AsyncClient(transport=httpx.MockTransport(server.handle)),
        ttl_seconds=3600,
        min_refresh_seconds=60,
        clock=clock,
    )


async def test_jwks_cache_refetches_when_a_new_key_id_appears_but_not_too_often() -> None:
    server, clock = FakeJwksServer(), FakeClock()
    cache = _cache(server, clock)
    assert await cache.get_key(KEY_ID) is not None
    assert server.requests == 1

    # Key rotation: a second key is published, but we may not look for 60 s.
    server.keys.append(_jwk(OTHER_KEY, "key-2"))
    clock.now += 10
    assert await cache.get_key("key-2") is None
    assert server.requests == 1

    clock.now += 60
    assert await cache.get_key("key-2") is not None
    assert server.requests == 2


async def test_jwks_cache_unknown_key_ids_cannot_cause_a_fetch_storm() -> None:
    server, clock = FakeJwksServer(), FakeClock()
    cache = _cache(server, clock)
    await cache.get_key(KEY_ID)

    clock.now += 61
    for index in range(20):
        assert await cache.get_key(f"random-{index}") is None

    assert server.requests == 2  # the first fetch, plus one allowed refresh


async def test_jwks_cache_refetches_after_the_ttl() -> None:
    server, clock = FakeJwksServer(), FakeClock()
    cache = _cache(server, clock)
    await cache.get_key(KEY_ID)

    clock.now += 3599
    await cache.get_key(KEY_ID)
    assert server.requests == 1

    clock.now += 2
    await cache.get_key(KEY_ID)
    assert server.requests == 2


async def test_jwks_cache_fails_when_nothing_is_cached_and_the_fetch_fails() -> None:
    server, clock = FakeJwksServer(failing=True), FakeClock()

    with pytest.raises(JwksUnavailable):
        await _cache(server, clock).get_key(KEY_ID)


async def test_jwks_cache_keeps_serving_stale_keys_when_a_refresh_fails() -> None:
    server, clock = FakeJwksServer(), FakeClock()
    cache = _cache(server, clock)
    await cache.get_key(KEY_ID)

    server.failing = True
    clock.now += 7200  # well past the ttl

    assert await cache.get_key(KEY_ID) is not None


async def test_jwks_cache_ignores_keys_it_cannot_parse() -> None:
    server, clock = FakeJwksServer(), FakeClock()
    server.keys.extend(
        [{"kid": "broken", "kty": "RSA"}, {"kty": "RSA"}, {"kid": "ec", "kty": "EC"}]
    )
    cache = _cache(server, clock)

    assert await cache.get_key(KEY_ID) is not None
    assert await cache.get_key("broken") is None
    assert await cache.get_key("ec") is None


# --- dev tokens ----------------------------------------------------------------------


def _local_app() -> FastAPI:
    app = create_app(make_settings(env="local", auth=AuthSettings(dev_signing_key=DEV_KEY)))
    _add_test_routes(app)
    return app


def _dev_token(*roles: Role, ttl: timedelta = timedelta(hours=1)) -> str:
    settings = make_settings(env="local", auth=AuthSettings(dev_signing_key=DEV_KEY))
    return issue_dev_token(
        settings,
        user_id=EMBER_USER,
        tenant_id=EMBER_TENANT,
        roles=frozenset(roles or {Role.REP}),
        ttl=ttl,
    )


async def test_dev_token_is_accepted_in_local_and_sets_the_tenant() -> None:
    async with _client(_local_app()) as client:
        response = await client.get("/test/me", headers=bearer(_dev_token()))

    assert response.status_code == 200
    assert response.json()["context_tenant_id"] == str(EMBER_TENANT)


async def test_dev_token_roles_are_enforced() -> None:
    async with _client(_local_app()) as client:
        as_rep = await client.get("/test/admin", headers=bearer(_dev_token(Role.REP)))
        as_admin = await client.get("/test/admin", headers=bearer(_dev_token(Role.ADMIN)))

    assert (as_rep.status_code, as_admin.status_code) == (403, 200)


async def test_expired_dev_token_is_401() -> None:
    async with _client(_local_app()) as client:
        response = await client.get("/test/me", headers=bearer(_dev_token(ttl=timedelta(hours=-1))))

    assert_unauthorized(response)


async def test_dev_token_with_a_wrong_signature_is_401() -> None:
    forged = jwt.encode(
        {
            "iss": "ember-dev",
            "aud": "ember-api",
            "sub": str(EMBER_USER),
            "tenant_id": str(EMBER_TENANT),
            "roles": ["admin"],
            "exp": int(time.time()) + 3600,
        },
        "some-other-key-that-is-long-enough-0123456789",
        algorithm="HS256",
    )

    async with _client(_local_app()) as client:
        response = await client.get("/test/me", headers=bearer(forged))

    assert_unauthorized(response)


@pytest.mark.parametrize(
    "claims",
    [
        {"roles": ["superuser"]},
        {"roles": "admin"},
        {"tenant_id": "not-a-uuid"},
        {"tenant_id": None},
        {"sub": "not-a-uuid"},
    ],
)
async def test_dev_token_with_invalid_claims_is_401(claims: dict[str, Any]) -> None:
    payload: dict[str, Any] = {
        "iss": "ember-dev",
        "aud": "ember-api",
        "sub": str(EMBER_USER),
        "tenant_id": str(EMBER_TENANT),
        "roles": ["rep"],
        "exp": int(time.time()) + 3600,
        **claims,
    }
    forged = jwt.encode(payload, DEV_KEY, algorithm="HS256")

    async with _client(_local_app()) as client:
        response = await client.get("/test/me", headers=bearer(forged))

    assert_unauthorized(response)


@pytest.mark.parametrize("env", ["test", "staging", "production"])
async def test_dev_token_is_rejected_outside_local(env: str) -> None:
    # Even a correctly signed dev token is refused where dev auth is off. The app is built
    # as "test" because staging and production refuse to start without Entra settings.
    app = create_app(make_settings())
    app.state.authenticator = build_authenticator(
        make_settings(
            env=env,
            auth=AuthSettings(entra_tenant_id=ENTRA_TENANT, audience=AUDIENCE),
        ),
        FakeDirectory({}),
    )
    _add_test_routes(app)

    async with _client(app) as client:
        response = await client.get("/test/me", headers=bearer(_dev_token()))

    assert_unauthorized(response)


async def test_local_without_a_dev_key_rejects_dev_tokens() -> None:
    app = create_app(make_settings(env="local"))
    _add_test_routes(app)

    async with _client(app) as client:
        response = await client.get("/test/me", headers=bearer(_dev_token()))

    assert_unauthorized(response)


async def test_algorithm_confusion_token_is_401_in_local_too() -> None:
    async with _client(_local_app()) as client:
        response = await client.get("/test/me", headers=bearer(_hs256_signed_with_public_key()))

    assert_unauthorized(response)


@pytest.mark.parametrize("env", ["test", "staging", "production"])
def test_issue_dev_token_refuses_outside_local(env: str) -> None:
    with pytest.raises(DevAuthDisabled):
        issue_dev_token(
            make_settings(env=env),
            user_id=EMBER_USER,
            tenant_id=EMBER_TENANT,
            roles=frozenset({Role.REP}),
            ttl=timedelta(hours=1),
        )


def test_issue_dev_token_refuses_without_a_key() -> None:
    with pytest.raises(DevAuthDisabled):
        issue_dev_token(
            make_settings(env="local"),
            user_id=EMBER_USER,
            tenant_id=EMBER_TENANT,
            roles=frozenset({Role.REP}),
            ttl=timedelta(hours=1),
        )


# --- configuration -------------------------------------------------------------------


@pytest.mark.parametrize("env", ["test", "staging", "production"])
def test_a_dev_signing_key_is_refused_outside_local(env: str) -> None:
    with pytest.raises(ValidationError, match="only be set when EMBER_ENV=local"):
        make_settings(env=env, auth=AuthSettings(dev_signing_key=DEV_KEY))  # type: ignore[arg-type]


def test_a_short_dev_signing_key_is_refused() -> None:
    with pytest.raises(ValidationError, match="at least 32 characters"):
        AuthSettings(dev_signing_key="too-short")  # type: ignore[arg-type]


def test_dev_signing_key_is_hidden_in_repr() -> None:
    settings = make_settings(env="local", auth=AuthSettings(dev_signing_key=DEV_KEY))

    assert DEV_KEY not in repr(settings)


@pytest.mark.parametrize("env", ["staging", "production"])
def test_staging_and_production_refuse_to_start_without_entra_settings(env: str) -> None:
    with pytest.raises(AuthConfigurationError, match="ENTRA_TENANT_ID"):
        build_authenticator(make_settings(env=env))


@pytest.mark.parametrize("env", ["staging", "production"])
def test_staging_and_production_start_with_entra_settings(env: str) -> None:
    settings = make_settings(
        env=env, auth=AuthSettings(entra_tenant_id=ENTRA_TENANT, audience=AUDIENCE)
    )

    assert build_authenticator(settings) is not None


async def test_without_a_directory_a_valid_entra_token_is_403() -> None:
    # Until identity (F4) provides a UserDirectory, nobody is a known user.
    jwks = FakeJwksServer()
    app = create_app(make_settings())
    app.state.authenticator = build_authenticator(
        _entra_settings(), http_client=httpx.AsyncClient(transport=httpx.MockTransport(jwks.handle))
    )
    _add_test_routes(app)

    async with _client(app) as client:
        response = await client.get("/test/me", headers=bearer(entra_token()))

    assert response.status_code == 403
