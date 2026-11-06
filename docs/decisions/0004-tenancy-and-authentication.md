# 0004. Tenancy and authentication

- Status: accepted
- Date: 2026-11-06

## Context

Every request must be tied to a user and a tenant, and every query must stay inside that
tenant (AGENTS.md sections 4, 5 and 9). Users sign in with Microsoft Entra ID. The `identity`
module that owns tenants and users does not exist until F4, and local development must not
depend on Entra.

## Decision

- **Tenant context:** the current tenant lives in a context variable (`TenantContext`).
  `current_user` sets it for the length of an authenticated request and resets it afterwards;
  a worker job uses `TenantContext.use(...)`.
- **Repositories:** `TenantScopedRepository` filters every query by the current tenant and
  raises `TenantNotSet` when there is none, so there is no way to read unscoped rows by
  forgetting to set a tenant. A row of another tenant looks exactly like a missing row.
  Repositories bind to `TenantModel`, an abstract base made of the three standard mixins.
  `tests/tenant_isolation.py` is the reusable proof every repository test calls.
- **Pagination:** keyset cursor over `(created_at, id)`, opaque to clients, default page size
  50, maximum 200 (AGENTS.md section 5). The cursor is not signed: tampering can only move
  the caller around inside their own tenant's rows.
- **Entra tokens:** RS256 only. Issuer (`{authority}/{tenant}/v2.0`), audience, expiry
  (with configurable clock skew), signature and the `tid`/`oid` claims are checked. Signing
  keys come from the tenant's JWKS, fetched with an async HTTP client (PyJWT's own
  `PyJWKClient` blocks the event loop) and cached. A refresh is triggered by the cache
  expiring or by an unknown key id, but never more often than a configured minimum interval,
  and stale keys keep working if a refresh fails.
- **Users and roles come from our database, not from the token.** The verified
  `(tid, oid)` is resolved by a `UserDirectory` protocol that `identity` implements in F4. Until
  then the default directory knows nobody, so a valid Entra token gets 403.
- **Dev tokens:** HS256 tokens signed with `EMBER_AUTH__DEV_SIGNING_KEY`, carrying the user,
  tenant and roles directly. They are verified and issued only when `EMBER_ENV=local`, the
  settings refuse to load if a dev key is set in any other environment, and the key must be at
  least 32 characters. `scripts/dev_token.py` mints them.
- **Algorithm handling:** the unverified header only selects the verification path. Each
  path passes its own fixed algorithm list to PyJWT, so `alg: none` and HS256-with-the-public-key
  tokens cannot reach the Entra path.
- **Error mapping:** no or invalid token is 401 with `WWW-Authenticate: Bearer`; a valid token
  with no Ember account, or a missing role, is 403; Entra keys unreachable is 503. The client
  is never told why a token was rejected; the reason code is logged and the token never is.
- **Fail closed:** anything not configured is simply not accepted. Staging and production
  refuse to start without `EMBER_AUTH__ENTRA_TENANT_ID` and `EMBER_AUTH__AUDIENCE`.
- **Roles are not hierarchical.** `require_role(Role.TEAM_LEAD, Role.ADMIN)` lists every role
  allowed. Whether an admin implicitly has team-lead rights is a business rule to confirm
  with the client; explicit lists are the safe default until then.

## Consequences

- One Entra directory is supported today. Serving several customers, each with their own
  Entra tenant, means registering the app as multi-tenant and accepting several issuers
  mapped to Ember tenants. `UserDirectory` already receives the `tid`, so that change stays
  inside `core/security.py` and `identity`.
- Only v2.0 Entra tokens are accepted. The app registration must request v2 tokens.
- The WebSocket service (F6) will authenticate with the same `Authenticator`, since the
  dependency is only a thin wrapper around it.
- Tenant isolation is enforced in application code. Row-level security remains a possible
  second layer (see ADR 0003).

## Alternatives considered

- **Roles from the Entra token (app roles or groups):** would put authorisation in the
  customer's directory and skip our database. We need per-tenant users and roles in our own
  data anyway.
- **`PyJWKClient`:** simple, but its fetch is blocking I/O in the request path.
- **Setting the tenant per query instead of per request:** easy to forget in one place; a
  request-scoped context makes forgetting impossible and visible (it raises).
