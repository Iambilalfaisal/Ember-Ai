# Architecture

Ember is a modular monolith: one codebase, three processes, business logic split into modules
with enforced boundaries. The rules are in [AGENTS.md](../AGENTS.md); the reasons are in the
[ADRs](decisions/). This page shows how the pieces fit, using the `identity` module as the
reference example.

## Processes

| Entrypoint | Purpose |
|---|---|
| `entrypoints/api.py` | HTTP API (`/api/v1`) |
| `entrypoints/realtime.py` | WebSocket live-call sessions (`uv run poe realtime`) |
| `entrypoints/worker.py` | Background jobs and the scheduler (`uv run poe worker`, `uv run poe scheduler`) |

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
├── events.py       UserInvited, register_handlers (enqueues the example job)
└── tasks.py        log_user_invited (the example job)
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

## Events and background jobs

A module announces what happened with an event, and does slow work in a job. Both are delivered
only after the transaction that caused them commits ([ADR 0006](decisions/0006-events-and-background-jobs.md)).

```
POST /api/v1/users  ->  IdentityService.invite_user  ->  bus.publish(UserInvited)      (queued)
                                                          session commits
                        bus delivers UserInvited     ->  handler enqueues identity.log_user_invited
                                                          response is sent
worker (separate process)  <-  Redis stream  <-  the job: runs as that tenant, in its own transaction
```

- **Publish** from a service with `await events.publish(SomethingHappened(tenant_id=..., ...))`.
  Name events in the past tense and carry ids, never personal data. If the request raises or the
  commit fails, nothing is delivered.
- **React** by adding a handler in the module's `events.py` (`register_handlers(bus)`). Handlers
  run in the API or worker process before the response, so keep them quick: enqueue a job. A handler
  that fails is logged and does not affect the request.
- **Jobs** are declared in `tasks.py` with `@task("module.verb")` and sent with
  `await my_task.enqueue(tenant_id=..., ...)`. A job takes `tenant_id` first, runs as that tenant, and
  can take `session: JobSession` for its one transaction. Jobs are delivered at least once, so make them
  safe to repeat. Periodic jobs use `cron=` (and no tenant) and run under `uv run poe scheduler`.
- **Not guaranteed:** events are not stored. A crash between commit and delivery loses the event.

## Adapters and the AI gateway

Everything external sits behind an interface in `adapters/`, with a `fake.py` for tests
([ADR 0007](decisions/0007-adapters-and-ai-gateway.md)):

```
adapters/ai/        gateway, OpenAI provider, fake provider, task config, prompts, usage, tracing
adapters/stt/       streaming token for the desktop, batch transcription (interface + fake)
adapters/storage/   tenant-scoped blob upload, download, signed URL (interface + fake)
adapters/clickup/   interface + fake
adapters/msgraph/   interface + fake
```

Code never names a model. It names a task, and `config/ai_tasks.yaml` decides the rest:

```python
gateway = Depends(get_ai_gateway)  # one per process, built at startup
async for piece in gateway.stream(
    task="live_answer", messages=messages, prompt=prompt.ref
):
    ...  # the tenant comes from TenantContext
```

For every attempt the gateway enforces the task's timeout, tries the task's fallback model if the
primary fails, writes one `ai_usage` row (tokens, cost, latency, tenant) in its own transaction, and
sends a Langfuse trace. A recording or tracing failure never fails the call. To change a task's model,
limits or fallback, edit `ai_tasks.yaml`; its prices live there too.

Prompts are files, `modules/<m>/prompts/<name>.v<N>.md`, loaded with
`PromptLibrary(folder).load(name, version=N)`. Run the live smoke test (a few cents, needs
`EMBER_AI__OPENAI_API_KEY`) with `EMBER_RUN_LIVE_TESTS=1 uv run pytest -m live`.

## Live calls (realtime)

The desktop streams transcript text to the realtime process over one WebSocket per call
([ADR 0008](decisions/0008-realtime-skeleton.md)); it gets answer cards back, streamed word by word.
The pipeline is a **fake** for now: it proves the plumbing and the latency budget, nothing more.

```
desktop --Authorization: Bearer--> /ws/v1/calls/{call_id}      (accepted, then token checked)
  session.start (seq 0)         ->  session.ready {resumed, last_client_seq}
  transcript.final (seq n)      ->  Redis: claim n   ->  queue  ->  pipeline
                                    detect -> rewrite -> retrieve -> generate (gateway, streamed)
                                <-  card.start, card.delta ..., card.end      (or card.not_confirmed)
  session.end                   ->  connection closed (1000)
```

- **Protocol:** `modules/calls/live/protocol.py`. One envelope `{v, type, call_id, seq, payload}`; the
  desktop numbers its messages for the whole call, so after a reconnect it re-sends what came after
  `last_client_seq` and the server acts on each number once.
- **State:** one Redis hash per call (`ember:live:<tenant>:<call>`): owner, status, last number. No
  transcript text.
- **Pipeline:** `LivePipeline.answer(utterance, emit)`. Swap `FakePipeline` for the real one; the session,
  numbering and resume stay as they are.
- **Try it:** `uv run poe realtime`, then connect with any WebSocket client that can set the
  `Authorization` header (a dev token from `scripts/dev_token.py` works in `local`).

## Contracts

The desktop and web clients are TypeScript, so what they call is generated from the backend, never
re-typed ([ADR 0009](decisions/0009-contracts.md)):

```
HTTP API app  --openapi-->  contracts/openapi.json  --openapi-typescript-->  contracts/ts/api/
calls/live/protocol.py  --JSON Schema-->  contracts/realtime/*.schema.json  --json2ts-->  contracts/ts/realtime/
```

`uv run poe openapi` regenerates `contracts/`; `uv run poe openapi-check` (part of `uv run poe check` and
of CI) fails if the committed files differ from what the backend produces. A change to a route, a schema or a
live-call message therefore lands together with its regenerated contract. See `contracts/README.md` for how
the clients use it.

## Evaluation

`eval/` asks golden questions the way the live pipeline will (search, then the `live_answer` task through the
real gateway and prompt) and writes a dated report of correctness, groundedness, "Not confirmed" precision and
recall, and latency ([ADR 0010](decisions/0010-evaluation-harness.md)). `uv run poe eval --check-regression`
fails if a score fell since the latest comparable report; AGENTS.md section 7 requires that for any prompt, model,
chunking or retrieval change. Today it runs offline against fakes. See `eval/README.md` for the report format.

## Adding a module

```
uv run python scripts/new_module.py accounts          # add --ai if it uses prompts
```

The generator creates the standard files, a matching `tests/modules/accounts/` folder with
skipped placeholder tests, and a contract in `pyproject.toml` that keeps other modules on
`accounts.public`. Nothing else needs registering: the API mounts every
`ember.modules.<name>.router.router`, every entrypoint subscribes each `events.register_handlers`
and imports each `tasks.py`, and Alembic imports every `ember.modules.<name>.models`.
Then write the models, run `uv run alembic revision --autogenerate -m "..."`, review the migration
and replace the placeholder tests.

## Local development

`uv run poe dev` starts Postgres and Redis, `uv run poe migrate` applies migrations, and
`uv run python scripts/create_tenant.py --name ... --admin-email ...` creates a tenant. With a dev
signing key in `.env`, `scripts/dev_token.py` mints a token for it (see the root README).
