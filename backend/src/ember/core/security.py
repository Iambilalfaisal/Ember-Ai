"""Authentication and role checks.

A request carries ``Authorization: Bearer <token>``. ``current_user`` verifies the token,
maps it to an Ember user (and so a tenant and roles), sets ``TenantContext`` for the rest of
the request and returns the user. ``require_role`` adds a role check on top.

Two kinds of token are accepted:

* **Entra ID access tokens** (RS256): issuer, audience, expiry and signature (against the
  tenant's cached JWKS) are checked, then the ``tid``/``oid`` claims are resolved to a user by
  the ``UserDirectory``. Roles come from our own database, never from the token.
* **Dev tokens** (HS256, signed with ``EMBER_AUTH__DEV_SIGNING_KEY``): accepted only when
  ``EMBER_ENV=local``. They carry the user, tenant and roles directly, so local work does not
  need Entra or a populated database.

The algorithm in the (untrusted) token header only chooses the verification path. Each path
passes its own fixed algorithm list to PyJWT, so a token cannot pick how it is verified.

Failures never reveal why a token was rejected; the reason code goes to the log, and the
token itself is never logged.
"""

import asyncio
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Annotated, Any, Protocol

import httpx
import jwt
import structlog
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ember.core.config import Settings
from ember.core.errors import Forbidden, Unauthorized, UpstreamUnavailable
from ember.core.observability import bind_tenant_id
from ember.core.tenancy import TenantContext

logger = structlog.get_logger(__name__)

DEV_ISSUER = "ember-dev"
DEV_AUDIENCE = "ember-api"
_ENTRA_ALGORITHM = "RS256"
_DEV_ALGORITHM = "HS256"


class Role(StrEnum):
    REP = "rep"
    TEAM_LEAD = "team_lead"
    ADMIN = "admin"


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    roles: frozenset[Role]


@dataclass(frozen=True, slots=True)
class EntraIdentity:
    """Who Entra says the caller is: the directory (``tid``) and the user object id (``oid``)."""

    entra_tenant_id: str
    object_id: str


class UserDirectory(Protocol):
    """Maps a verified Entra identity to an Ember user. The ``identity`` module provides it."""

    async def resolve(self, identity: EntraIdentity) -> AuthenticatedUser | None:
        """Return the user, or ``None`` when no Ember account is linked to this identity."""
        ...


class DenyAllUserDirectory:
    """Default until ``identity`` exists: a valid Entra token is accepted but nobody is known."""

    async def resolve(self, identity: EntraIdentity) -> AuthenticatedUser | None:
        return None


class AuthConfigurationError(RuntimeError):
    """Authentication is not configured safely for this environment."""


class DevAuthDisabled(RuntimeError):
    """A dev token was requested while dev auth is off (not local, or no signing key)."""


class TokenRejected(Exception):
    """The token is not acceptable. ``reason`` is a short code for the log, not for the client."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class JwksUnavailable(Exception):
    """The signing keys could not be fetched and none are cached."""


def _decode(token: str, key: Any, *, algorithm: str, **options: Any) -> dict[str, Any]:
    """``jwt.decode`` with a fixed algorithm, mapping PyJWT errors to a ``TokenRejected`` reason."""
    try:
        return jwt.decode(token, key, algorithms=[algorithm], **options)
    except jwt.ExpiredSignatureError as exc:
        raise TokenRejected("expired") from exc
    except jwt.ImmatureSignatureError as exc:
        raise TokenRejected("not_yet_valid") from exc
    except jwt.InvalidAudienceError as exc:
        raise TokenRejected("invalid_audience") from exc
    except jwt.InvalidIssuerError as exc:
        raise TokenRejected("invalid_issuer") from exc
    except jwt.InvalidSignatureError as exc:
        raise TokenRejected("invalid_signature") from exc
    except jwt.MissingRequiredClaimError as exc:
        raise TokenRejected("missing_claim") from exc
    except jwt.PyJWTError as exc:
        raise TokenRejected("invalid") from exc


# --- Entra ID ----------------------------------------------------------------


class JwksCache:
    """Signing keys of one Entra tenant, fetched asynchronously and cached.

    Keys are refreshed when the cache is older than ``ttl_seconds``, or when a token names a
    key id we do not have (Entra rotates keys). Fetches are at least ``min_refresh_seconds``
    apart, so a flood of tokens with random key ids cannot turn into a flood of requests to
    Entra. If a refresh fails, stale keys keep working.
    """

    def __init__(
        self,
        url: str,
        http_client: httpx.AsyncClient,
        *,
        ttl_seconds: float,
        min_refresh_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._url = url
        self._http = http_client
        self._ttl = ttl_seconds
        self._min_refresh = min_refresh_seconds
        self._clock = clock
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at: float | None = None
        self._last_attempt: float | None = None
        self._lock = asyncio.Lock()

    async def get_key(self, key_id: str) -> jwt.PyJWK | None:
        """Return the signing key with this id, or ``None`` if Entra does not publish it.

        Raises:
            JwksUnavailable: keys are needed but cannot be fetched and none are cached.
        """
        if self._needs_refresh(key_id in self._keys):
            async with self._lock:
                # Another request may have refreshed while this one waited for the lock.
                if self._needs_refresh(key_id in self._keys):
                    await self._refresh()
        return self._keys.get(key_id)

    def _needs_refresh(self, key_known: bool) -> bool:
        now = self._clock()
        if self._last_attempt is None:
            return True
        if now - self._last_attempt < self._min_refresh:
            return False
        expired = self._fetched_at is None or now - self._fetched_at >= self._ttl
        return expired or not key_known

    async def _refresh(self) -> None:
        self._last_attempt = self._clock()
        try:
            response = await self._http.get(self._url)
            response.raise_for_status()
            documents = response.json()["keys"]
            keys = {
                document["kid"]: key
                for document in documents
                if (key := self._parse_key(document)) is not None
            }
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("auth.jwks_refresh_failed", error=type(exc).__name__)
            if not self._keys:
                raise JwksUnavailable from exc
            return
        self._keys = keys
        self._fetched_at = self._clock()

    @staticmethod
    def _parse_key(document: Any) -> jwt.PyJWK | None:
        try:
            if document["kid"] and document.get("kty") == "RSA":
                return jwt.PyJWK(document)
        except (jwt.PyJWTError, KeyError, TypeError, AttributeError):
            return None
        return None


class EntraTokenVerifier:
    def __init__(
        self,
        *,
        entra_tenant_id: str,
        audience: str,
        authority: str,
        jwks: JwksCache,
        leeway_seconds: int,
    ) -> None:
        self._tenant = entra_tenant_id
        self._audience = audience
        self._issuer = f"{authority.rstrip('/')}/{entra_tenant_id}/v2.0"
        self._jwks = jwks
        self._leeway = leeway_seconds

    async def verify(self, token: str, header: Mapping[str, Any]) -> EntraIdentity:
        """Check signature, issuer, audience and expiry; return who the token is for."""
        key_id = header.get("kid")
        if not isinstance(key_id, str):
            raise TokenRejected("missing_key_id")
        key = await self._jwks.get_key(key_id)
        if key is None:
            raise TokenRejected("unknown_key")
        claims = _decode(
            token,
            key.key,
            algorithm=_ENTRA_ALGORITHM,
            audience=self._audience,
            issuer=self._issuer,
            leeway=self._leeway,
            options={"require": ["exp", "iss", "aud"]},
        )
        tid, oid = claims.get("tid"), claims.get("oid")
        if tid != self._tenant or not isinstance(oid, str) or not oid:
            raise TokenRejected("missing_claim")
        return EntraIdentity(entra_tenant_id=tid, object_id=oid)


# --- local dev tokens --------------------------------------------------------


def issue_dev_token(
    settings: Settings,
    *,
    user_id: uuid.UUID,
    tenant_id: uuid.UUID,
    roles: frozenset[Role],
    ttl: timedelta,
) -> str:
    """Sign a dev token for local work.

    Raises:
        DevAuthDisabled: ``EMBER_ENV`` is not ``local`` or no signing key is configured.
    """
    key = settings.auth.dev_signing_key
    if settings.env != "local" or key is None:
        raise DevAuthDisabled("Dev tokens need EMBER_ENV=local and EMBER_AUTH__DEV_SIGNING_KEY.")
    now = datetime.now(UTC)
    claims = {
        "iss": DEV_ISSUER,
        "aud": DEV_AUDIENCE,
        "sub": str(user_id),
        "tenant_id": str(tenant_id),
        "roles": sorted(roles),
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(claims, key.get_secret_value(), algorithm=_DEV_ALGORITHM)


class DevTokenVerifier:
    def __init__(self, signing_key: str) -> None:
        self._key = signing_key

    def verify(self, token: str) -> AuthenticatedUser:
        claims = _decode(
            token,
            self._key,
            algorithm=_DEV_ALGORITHM,
            audience=DEV_AUDIENCE,
            issuer=DEV_ISSUER,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
        try:
            return AuthenticatedUser(
                user_id=uuid.UUID(claims["sub"]),
                tenant_id=uuid.UUID(claims["tenant_id"]),
                roles=frozenset(Role(role) for role in claims["roles"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise TokenRejected("invalid_claims") from exc


# --- putting it together -----------------------------------------------------


class Authenticator:
    """Turns a bearer token into an ``AuthenticatedUser`` or raises an ``AppError``."""

    def __init__(
        self,
        *,
        directory: UserDirectory,
        entra: EntraTokenVerifier | None,
        dev: DevTokenVerifier | None,
        owned_http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._directory = directory
        self._entra = entra
        self._dev = dev
        self._owned_http_client = owned_http_client

    async def authenticate(self, token: str) -> AuthenticatedUser:
        """Verify ``token`` and return its user.

        Raises:
            Unauthorized: the token is missing, malformed, expired or otherwise invalid.
            Forbidden: the token is valid but no Ember account is linked to it.
            UpstreamUnavailable: Entra's signing keys could not be fetched.
        """
        try:
            return await self._authenticate(token)
        except TokenRejected as exc:
            logger.info("auth.token_rejected", reason=exc.reason)
            raise Unauthorized("The access token is not valid.") from exc
        except JwksUnavailable as exc:
            raise UpstreamUnavailable("Sign-in keys are temporarily unavailable.") from exc

    async def _authenticate(self, token: str) -> AuthenticatedUser:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise TokenRejected("malformed") from exc
        algorithm = header.get("alg")
        if algorithm == _DEV_ALGORITHM:
            if self._dev is None:
                raise TokenRejected("dev_tokens_disabled")
            return self._dev.verify(token)
        if algorithm == _ENTRA_ALGORITHM:
            if self._entra is None:
                raise TokenRejected("entra_not_configured")
            identity = await self._entra.verify(token, header)
            user = await self._directory.resolve(identity)
            if user is None:
                logger.info("auth.user_not_provisioned")
                raise Forbidden("No Ember account is linked to this sign-in.")
            return user
        raise TokenRejected("unsupported_algorithm")

    async def aclose(self) -> None:
        if self._owned_http_client is not None:
            await self._owned_http_client.aclose()


def build_authenticator(
    settings: Settings,
    directory: UserDirectory | None = None,
    *,
    http_client: httpx.AsyncClient | None = None,
) -> Authenticator:
    """Build the authenticator for ``settings``.

    Anything that is not configured is simply not accepted (fail closed), except that
    staging and production refuse to start without Entra settings.

    Raises:
        AuthConfigurationError: staging or production without ``entra_tenant_id``/``audience``.
    """
    auth = settings.auth
    entra: EntraTokenVerifier | None = None
    owned_client: httpx.AsyncClient | None = None
    if auth.entra_tenant_id and auth.audience:
        if http_client is None:
            http_client = owned_client = httpx.AsyncClient(timeout=auth.jwks_timeout_seconds)
        jwks = JwksCache(
            f"{auth.authority.rstrip('/')}/{auth.entra_tenant_id}/discovery/v2.0/keys",
            http_client,
            ttl_seconds=auth.jwks_cache_seconds,
            min_refresh_seconds=auth.jwks_min_refresh_seconds,
        )
        entra = EntraTokenVerifier(
            entra_tenant_id=auth.entra_tenant_id,
            audience=auth.audience,
            authority=auth.authority,
            jwks=jwks,
            leeway_seconds=auth.clock_skew_seconds,
        )
    elif settings.env in ("staging", "production"):
        raise AuthConfigurationError(
            "EMBER_AUTH__ENTRA_TENANT_ID and EMBER_AUTH__AUDIENCE are required "
            f"when EMBER_ENV={settings.env}."
        )
    dev: DevTokenVerifier | None = None
    if settings.env == "local" and auth.dev_signing_key is not None:
        dev = DevTokenVerifier(auth.dev_signing_key.get_secret_value())
    return Authenticator(
        directory=directory or DenyAllUserDirectory(),
        entra=entra,
        dev=dev,
        owned_http_client=owned_client,
    )


# --- FastAPI dependencies ----------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)


async def current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> AsyncIterator[AuthenticatedUser]:
    """Authenticate the request and set the tenant context until the request ends.

    Raises:
        Unauthorized: no bearer token, or the token is not valid.
        Forbidden: the token is valid but not linked to an Ember account.
    """
    if credentials is None:
        raise Unauthorized("A bearer access token is required.")
    authenticator: Authenticator = request.app.state.authenticator
    user = await authenticator.authenticate(credentials.credentials)
    token = TenantContext.set(user.tenant_id)
    bind_tenant_id(str(user.tenant_id))
    try:
        yield user
    finally:
        TenantContext.reset(token)


CurrentUser = Annotated[AuthenticatedUser, Depends(current_user)]


def require_role(*roles: Role) -> Callable[[AuthenticatedUser], Awaitable[AuthenticatedUser]]:
    """Dependency that allows the request only if the user has at least one of ``roles``.

    Roles are not hierarchical: a route open to team leads and admins lists both. Use as
    ``user: Annotated[AuthenticatedUser, Depends(require_role(Role.ADMIN))]``.

    Raises:
        Forbidden: (when the dependency runs) the user has none of the roles.
    """
    if not roles:
        raise ValueError("require_role needs at least one role")
    allowed = frozenset(roles)

    async def dependency(user: CurrentUser) -> AuthenticatedUser:
        if user.roles.isdisjoint(allowed):
            logger.info("auth.role_denied", user_id=str(user.user_id))
            raise Forbidden("Your role does not allow this action.")
        return user

    return dependency
