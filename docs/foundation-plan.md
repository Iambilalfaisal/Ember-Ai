# Ember — foundation plan

Goal: build a foundation that is clean, consistent and ready to scale, **before**
any product features. Every later feature plugs into this structure without
rework. Follow `AGENTS.md` for all rules.

Do the tasks in order. Each task is one pull request. A task is finished only when
every "Done when" item is true and `uv run poe check` passes.

Scope note: the foundation includes the structures that are expensive to add later
(module boundaries, tenant ids, adapters, timing, contracts, evals). It deliberately
leaves out things that are cheap to add later (row-level security, outbox,
partitioning, read replicas, multi-provider fallback, autoscaling rules).

---

## Stack

| Area | Choice |
|---|---|
| Language | Python 3.12, managed with `uv` |
| API | FastAPI, Pydantic v2, pydantic-settings |
| Database | PostgreSQL 16 + pgvector, SQLAlchemy 2.0 async + asyncpg, Alembic |
| Cache / queue | Redis 7, Taskiq + taskiq-redis |
| Auth | Microsoft Entra ID (JWT, PyJWT + cached JWKS) |
| Observability | structlog (JSON), OpenTelemetry, Langfuse (AI traces) |
| HTTP client | httpx (async) |
| Quality | ruff, mypy (strict), pytest, pytest-asyncio, testcontainers, import-linter, pre-commit |
| Local dev | docker-compose: postgres-pgvector, redis; Langfuse Cloud for AI traces |
| Hosting (later) | Azure Container Apps, Azure Database for PostgreSQL, Azure Cache for Redis, Blob, Key Vault |
| Desktop / web | Electron + React + TS (Windows first), Next.js + TS |

---

## F0 — Repository and tooling

Create the monorepo layout from `AGENTS.md` §1 (backend fully; `desktop/`, `web/`,
`contracts/`, `eval/`, `spikes/`, `infra/`, `docs/` as folders with a README each).

- `backend/pyproject.toml` with all dependencies above, tool config for ruff, mypy, pytest.
- `poethepoet` tasks in `backend/pyproject.toml` (run with `uv run poe <task>`): `dev`, `api`, `realtime`, `worker`, `test`, `lint`, `types`,
  `imports`, `migrate`, `openapi`, `check` (runs lint + types + imports + test + openapi drift).
- `infra/docker-compose.yml` with `pgvector/pgvector:pg16` and `redis:7`. Langfuse is not run locally (see ADR 0002).
- `.env.example`, `.gitignore`, `.pre-commit-config.yaml`, `docs/decisions/0000-template.md`.
- `docs/decisions/0001-modular-monolith-fastapi.md` recording the core architecture choice.

**Done when:** `uv run poe dev` starts Postgres and Redis; `uv run poe check` runs
(even with no tests yet); pre-commit runs ruff on commit.

---

## F1 — Config, logging, errors, health

- `core/config.py`: `Settings` with nested sections (`db`, `redis`, `auth`, `ai`,
  `stt`, `storage`, `observability`), env prefix `EMBER_`, `EMBER_ENV` in
  {`local`, `test`, `staging`, `production`}.
- `core/observability.py`: structlog JSON logger with request id and tenant id bound;
  OpenTelemetry setup; `stage_timer(name)` context manager that records a span and a
  latency histogram.
- `core/errors.py`: `AppError` base with `NotFound`, `Forbidden`, `Conflict`,
  `ValidationFailed`, `UpstreamUnavailable`; exception handler returning RFC 9457 problem+json.
- `core/health.py`: `/health/live` (process up) and `/health/ready` (DB + Redis reachable).
- `entrypoints/api.py`: app factory `create_app()` wiring the above; request-id middleware.

**Done when:** `uv run poe api` serves `/health/live` and `/health/ready`; an `AppError`
raised in a test route returns problem+json; logs are JSON with a request id; tests
cover all of it.

---

## F2 — Database foundation

- `core/db.py`: async engine, session factory, `get_session` dependency
  (commit on success, rollback on error).
- `core/models.py`: `Base`, `IdMixin` (UUID primary key), `TenantMixin`
  (`tenant_id` not null, indexed), `TimestampMixin` (UTC `timestamptz`).
- Alembic configured for async, autogenerate enabled, naming convention for constraints.
- pgvector extension enabled in the first migration.

**Done when:** `uv run poe migrate` creates the schema on a clean DB; an integration test
(testcontainers) creates and reads a row through a session; migrations run in CI.

---

## F3 — Tenancy and authentication

- `core/tenancy.py`: `TenantContext` (contextvar) and `TenantScopedRepository[Model]`
  with `get`, `list` (cursor pagination), `add`, `update`, `delete`, all filtered by the
  current tenant automatically. Raise if no tenant is set.
- `core/security.py`: Entra ID JWT validation (issuer, audience, signature via cached
  JWKS), mapping token → user → tenant → roles (`rep`, `team_lead`, `admin`);
  `current_user` and `require_role(...)` dependencies.
- Local dev auth: a signed dev token, only when `EMBER_ENV=local`.

**Done when:** a request with a valid token sets the tenant context; an invalid or
expired token returns 401; a wrong role returns 403; a generic test proves a
`TenantScopedRepository` cannot read another tenant's rows.

---

## F4 — Module template and the `identity` reference module

- `scripts/new_module.py <name>`: generates the module layout from `AGENTS.md` §2,
  a matching test folder, and registers the router.
- Build `identity` with the generator: `Tenant`, `User` models; `GET /api/v1/me`;
  admin endpoints to list and invite users; `public.py` exposing `get_user`,
  `get_tenant_settings`.
- `importlinter` contracts: modules only import each other via `public`; `core` and
  `adapters` never import `modules`.

**Done when:** `identity` passes service, route and tenant-isolation tests; the
import-linter contract fails if a test file deliberately imports `identity.models`
from another module (verify, then remove); `identity` is the documented example in
`docs/architecture.md`.

---

## F5 — Events and background jobs

- `core/events.py`: `Event` (Pydantic, past-tense names), `EventBus` protocol with
  `publish` and `subscribe`; in-process implementation that dispatches **after**
  the transaction commits.
- `core/tasks.py` + `entrypoints/worker.py`: Taskiq broker on Redis; modules
  register tasks from their `tasks.py`; scheduled-task support for daily jobs.
- Example: `identity` publishes `UserInvited`; a handler enqueues a task that logs it.

**Done when:** the example flows end to end in an integration test; an event is not
delivered if the transaction rolls back; `uv run poe worker` runs the worker.

---

## F6 — Adapters and the AI gateway

Each adapter has an interface (`Protocol`), a real implementation and a `fake.py` for tests.

- `adapters/ai/`: `gateway.py` with `complete(task, ...)`, `stream(task, ...)`,
  `embed(...)`; `config/ai_tasks.yaml` mapping tasks → provider, model, max tokens,
  timeout; one real provider; per-call recording of tokens, cost, latency, tenant;
  Langfuse tracing; prompt loader for versioned prompt files.
- `adapters/stt/`: `issue_streaming_token(tenant, call_id)` for the desktop; batch
  transcription interface for later.
- `adapters/storage/`: Blob upload, download, signed URL.
- `adapters/clickup/`, `adapters/msgraph/`: interfaces and fakes only for now.

**Done when:** a test streams a completion through the gateway using the fake
provider and the usage record is stored; switching a task's model needs only a
`ai_tasks.yaml` change; a live smoke test (skipped in CI) calls the real provider.

---

## F7 — Realtime service skeleton

- `entrypoints/realtime.py`: WebSocket endpoint `/ws/v1/calls/{call_id}`,
  authenticated with the same tokens.
- `modules/calls/live/protocol.py`: envelope and message models.
  - Desktop → server: `session.start`, `transcript.partial`, `transcript.final`,
    `card.feedback`, `session.end`.
  - Server → desktop: `session.ready`, `card.start`, `card.delta`, `card.end`,
    `card.not_confirmed`, `error`.
- `modules/calls/live/session.py`: session lifecycle, state in Redis, resume on reconnect.
- A **fake pipeline**: on `transcript.final` ending in "?", stream a fake card
  token by token via the AI gateway's fake provider. Every stage wrapped in `stage_timer`.

**Done when:** a test client completes start → transcript → streamed card → end;
reconnecting with the same `call_id` resumes the session; pipeline overhead with
fakes is under 100 ms in a timing test; stage timings appear in traces.

---

## F8 — Contracts

- `scripts/export_openapi.py`: writes `contracts/openapi.json` and generates a typed
  TypeScript client into `contracts/ts/`.
- Export realtime protocol models as JSON Schema and generate TS types into `contracts/ts/realtime/`.

**Done when:** `uv run poe openapi` regenerates both; CI fails if generated files are out of date.

---

## F9 — Evaluation harness

- `eval/golden/sample.jsonl`: anonymised example items
  (`question`, `expected_answer`, `source_doc`, `answerable`).
- `eval/run.py`: runs each question through the knowledge search + `live_answer`
  task, then scores correctness, groundedness, "Not confirmed" precision/recall,
  and latency (p50/p95, time to first token); writes a dated report to `eval/reports/`.

**Done when:** the runner works end to end against fakes and produces a report; the
report format is documented in `eval/README.md`.

---

## F10 — Continuous integration

GitHub Actions workflow on every PR: install with uv, ruff, mypy, import-linter,
pytest with Postgres + Redis services, migration up/down check, OpenAPI drift check.

**Done when:** a PR that breaks any of these fails CI.

---

## After the foundation: the two spikes (in `spikes/`)

These run on top of the foundation's adapters and protocol, and decide vendors and
retrieval design. Record results as ADRs.

**S1 — Live latency (Windows + Teams):** Electron captures mic and speaker loopback,
streams to two candidate transcription vendors, sends transcript to the F7 realtime
service, uses a real fast model, shows the card in a panel excluded from screen capture.
*Done when:* p50 and p95 end-to-end latency are measured on at least 20 real test-call
questions per vendor, and screen-share exclusion is verified in Teams.

**S2 — Answer quality:** load the client's documents, compare 2–3 chunking strategies,
hybrid search (pgvector + Postgres full-text), with and without reranking, and query
rewriting from recent conversation, scored with the F9 harness on the 30–50 golden questions.
*Done when:* a scorecard shows correctness, groundedness, latency and cost per setup,
and one setup reaches ≥90% correct with all unanswerable questions returning "Not confirmed".

Only after S1 and S2: create the `knowledge` and `calls` modules properly and
build the real live pipeline. `accounts`, `nurturing` and `integrations` follow
with the My Day work.
