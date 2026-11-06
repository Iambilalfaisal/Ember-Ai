# Architecture

Ember is a modular monolith: one codebase, three processes, business logic split into modules
with enforced boundaries. The rules are in [AGENTS.md](../AGENTS.md); the reasons are in the
[ADRs](decisions/). This page shows how the pieces fit, using the `identity` module as the
reference example.

## Processes

| Entrypoint | Purpose |
|---|---|
| `entrypoints/api.py` | HTTP API (`/api/v1`) |
| `entrypoints/realtime.py` | WebSocket live-call sessions (later) |
| `entrypoints/worker.py` | Background jobs (later) |

All three import the same modules. An entrypoint only wires things together: it builds the
engine, the authenticator and the app, and mounts each module's router. No business logic.

## Layers

```
core/        platform code every module shares: config, db, tenancy, security, errors, logging
adapters/    everything external (AI, speech-to-text, storage, ClickUp, Graph), behind interfaces
modules/     business modules: identity, knowledge, calls, accounts, nurturing, integrations
```

`core/` and `adapters/` never import `modules/`. A module imports another module only through
that module's `public.py`. Both rules are enforced by import-linter in CI (`uv run poe imports`).

Inside a module the direction is `router -> service -> repository`. Routers parse input, call
the service and return a schema. Services hold the business rules, never commit and never import
FastAPI. Repositories hold queries and no rules.

## A request, start to finish

1. `RequestIdMiddleware` assigns a request id (logged on every line, returned as `X-Request-ID`).
2. `current_user` reads the bearer token. `Authenticator` verifies it (Entra ID in real
   environments, a signed dev token in `local`) and maps it to a user, a tenant and roles.
3. `current_user` sets `TenantContext` for the rest of the request. `require_role(...)` then
   checks the role (401 no valid token, 403 wrong role).
4. The route gets its service. `SessionDep` gives one database session for the request.
5. Repositories filter every query by the current tenant. With no tenant set they raise.
6. The route returns a Pydantic schema. `SessionDep` commits before the response is sent, or
   rolls back if anything raised. Errors become RFC 9457 `problem+json`.

See [ADR 0003](decisions/0003-database-conventions.md) for the database and transaction rules and
[ADR 0004](decisions/0004-tenancy-and-authentication.md) for tenancy and authentication.

## Example: the `identity` module

`identity` owns tenants and users. It is the template other modules copy, so it shows every
file of the standard layout:

```
modules/identity/
├── public.py       get_user, get_tenant_settings, create_tenant_with_admin, IdentityUserDirectory
├── router.py       GET /me, GET /users (admin), POST /users (admin)
├── schemas.py      UserRead, InviteUser, MeRead, TenantSettings (Pydantic v2)
├── service.py      IdentityService: invite, list, sign-in resolution, tenant bootstrap
├── repository.py   UserRepository (tenant-scoped), TenantRepository (the registry)
├── models.py       Tenant, User (Alembic discovers this file automatically)
├── events.py       (empty until F5: UserInvited)
└── tasks.py        (empty until F5)
```

How it follows the rules:

- **Scoped data.** `User` extends `TenantModel`, and `UserRepository` extends
  `TenantScopedRepository`, so `get`, `list`, `add`, `update` and `delete` can only touch the
  current tenant's rows. `TenantRepository` is the one exception: the tenants table is where the
  tenant scope comes from.
- **Public surface.** Other modules and entrypoints call `public.py`, which takes the caller's
  session and returns DTOs, never ORM models. The sign-in glue, `IdentityUserDirectory`, is also
  exposed there. `core.security` defines the `UserDirectory` interface and `identity` implements
  it, so `core` never imports a module.
- **Sign-in.** A verified Entra token carries a directory id (`tid`) and an object id (`oid`).
  `identity` finds the tenant by directory id, then the user by object id. On a person's first
  sign-in it links the still-invited user with the same email, and activates them.
- **Roles come from the database,** not from the token.
- **Tests.** Service tests use fake repositories (no Docker). Repository tests run on real
  Postgres with the migrated schema and include the tenant-isolation proof. Route tests call the
  real app with dev tokens. See `tests/modules/identity/`.

## Adding a module

```
uv run python scripts/new_module.py accounts          # add --ai if it uses prompts
```

The generator creates the standard files, a matching `tests/modules/accounts/` folder with
skipped placeholder tests, and a contract in `pyproject.toml` that keeps other modules on
`accounts.public`. Nothing else needs registering: the API mounts every
`ember.modules.<name>.router.router`, and Alembic imports every `ember.modules.<name>.models`.
Then write the models, run `uv run alembic revision --autogenerate -m "..."`, review the migration
and replace the placeholder tests.

## Local development

`uv run poe dev` starts Postgres and Redis, `uv run poe migrate` applies migrations, and
`uv run python scripts/create_tenant.py --name ... --admin-email ...` creates a tenant. With a dev
signing key in `.env`, `scripts/dev_token.py` mints a token for it (see the root README).
