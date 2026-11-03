# AGENTS.md — Ember engineering rules

Read this file before writing any code. These rules apply to every task in this
repository. If a task conflicts with this file, stop and ask; do not guess.

Ember is an AI sales copilot. Reps get grounded, plain-language answers live on
Microsoft Teams calls, post-call summaries and follow-up drafts, and a daily
"My Day" list of opportunities that need attention. The first customer has
5–6 reps; the platform must later serve many companies (tenants).

---

## 1. Repository layout

```
ember/
├── backend/                 # Python, FastAPI (this file mostly covers backend)
│   ├── pyproject.toml
│   ├── alembic/             # migrations
│   ├── config/              # non-secret config files (e.g. ai_tasks.yaml)
│   ├── scripts/             # dev scripts (new_module.py, export_openapi.py)
│   ├── src/ember/
│   │   ├── entrypoints/     # api.py, realtime.py, worker.py
│   │   ├── core/            # platform code shared by all modules
│   │   ├── adapters/        # everything external, behind interfaces
│   │   └── modules/         # business modules
│   └── tests/               # mirrors src/ember
├── desktop/                 # Electron + React + TypeScript (Windows first)
├── web/                     # Next.js + TypeScript
├── contracts/               # generated TS client + realtime protocol types
├── eval/                    # golden questions + evaluation runner
├── spikes/                  # throwaway experiments; never imported by src
├── infra/                   # docker-compose, Azure templates
└── docs/
    ├── architecture.md
    └── decisions/           # ADRs: 0001-title.md
```

### Three processes, one codebase

| Entrypoint | Purpose | Scales with |
|---|---|---|
| `entrypoints/api.py` | HTTP API | users |
| `entrypoints/realtime.py` | WebSocket live-call sessions | concurrent calls |
| `entrypoints/worker.py` | background jobs (Taskiq) | queue depth |

All three import the same modules. Never put business logic in an entrypoint.

---

## 2. Modules

Planned modules (create a module only when its task says so; do not create empty ones):

| Module | Owns |
|---|---|
| `identity` | tenants, users, roles, sign-in |
| `knowledge` | documents, versions, chunks, embeddings, search |
| `calls` | call sessions, transcripts, live pipeline (`calls/live/`), summaries |
| `accounts` | companies, contacts, deals, stages, interactions |
| `nurturing` | rules engine, My Day, commitments, drafts, revival |
| `integrations` | ClickUp import/sync, Outlook via Microsoft Graph |

### Module layout (always the same)

```
modules/<name>/
├── __init__.py
├── public.py        # the ONLY file other modules may import
├── router.py        # FastAPI routes: parse input, call service, return schema
├── schemas.py       # Pydantic v2 request/response/DTO models
├── service.py       # business logic
├── repository.py    # database access (extends TenantScopedRepository)
├── models.py        # SQLAlchemy ORM models
├── events.py        # events this module publishes / handlers it registers
├── tasks.py         # Taskiq tasks
└── prompts/         # versioned prompt files, if the module uses AI
```

Generate new modules with `python scripts/new_module.py <name>`; do not hand-roll.

### Boundary rules (enforced by import-linter in CI)

1. A module may import another module **only** via `ember.modules.<other>.public`.
2. `public.py` exposes service functions/classes and DTO schemas. Never ORM models.
3. `core/` and `adapters/` must never import from `modules/`.
4. Modules never call external services directly; they use `adapters/`.
5. Prefer events over direct calls when the caller does not need an answer
   (e.g. `calls` publishes `SummaryApproved`; `nurturing` reacts).

### Layering inside a module

`router → service → repository`. Routers contain no business logic. Repositories
contain no business logic. Services never import FastAPI.

---

## 3. Core platform (`core/`)

| File | Responsibility |
|---|---|
| `config.py` | `Settings` via pydantic-settings, env prefix `EMBER_`, nested sections |
| `db.py` | async SQLAlchemy engine (asyncpg), session factory, `get_session` dependency |
| `models.py` | `Base`, mixins: `IdMixin` (UUID), `TenantMixin`, `TimestampMixin` |
| `tenancy.py` | `TenantContext` (contextvar), `TenantScopedRepository` |
| `security.py` | Entra ID JWT validation (JWKS cached), roles, `current_user` dependency |
| `errors.py` | `AppError` hierarchy → RFC 9457 problem+json responses |
| `events.py` | `Event` base, `EventBus` protocol, in-process implementation |
| `tasks.py` | Taskiq broker setup (Redis) |
| `cache.py` | Redis client helpers |
| `observability.py` | structlog JSON logging, OpenTelemetry, `stage_timer()` |
| `health.py` | `/health/live`, `/health/ready` |

---

## 4. Database rules

- PostgreSQL 16 with pgvector. Async SQLAlchemy 2.0 style only (`select()`, no legacy `Query`).
- Every business table has: `id UUID PK`, `tenant_id UUID NOT NULL` (indexed),
  `created_at`, `updated_at` (`timestamptz`, UTC).
- **All tenant data goes through `TenantScopedRepository`**, which filters by the
  current tenant automatically. Every repository must have a test proving tenant A
  cannot read tenant B's rows.
- One transaction per request/job. Services do not commit; the session dependency
  commits on success and rolls back on error. Events are dispatched after commit.
- Every schema change is an Alembic migration. Never edit an applied migration.
- No business thresholds in code or migrations (stalled days, confidence cut-offs…).
  They live in tenant settings or `config/`.

---

## 5. API rules

- All routes under `/api/v1`. Plural nouns: `/api/v1/documents/{id}`.
- Request and response bodies are Pydantic schemas; never return ORM objects.
- Errors use problem+json via `AppError`; never raise bare `HTTPException` in services.
- List endpoints use cursor pagination (`?cursor=&limit=`), default limit 50, max 200.
- Every route declares the role it requires.
- The OpenAPI spec is the contract: `scripts/export_openapi.py` regenerates
  `contracts/`; CI fails if it is out of date.

---

## 6. Realtime (live call) rules

- The desktop streams audio **directly** to the transcription vendor using a
  short-lived token issued by the backend. The realtime service receives
  transcript text only. Audio files are uploaded to Blob storage after the call.
- WebSocket messages use one envelope: `{ "v": 1, "type": str, "call_id": str,
  "seq": int, "payload": {...} }`. Every message type is a Pydantic model in
  `modules/calls/live/protocol.py`, exported as JSON Schema to `contracts/`.
- Session state lives in Redis so a reconnecting desktop resumes the call.
- At session start, preload: account context, tenant AI settings, the tenant's
  knowledge-base embeddings (in memory) and pre-approved answer cards.
- Wrap every pipeline stage in `stage_timer("<stage>")`: `detect`, `rewrite`,
  `retrieve`, `generate_first_token`, `generate_total`.
- The panel must never go blank: on vendor error or timeout, send the closest
  pre-approved card or a `not_confirmed` message.
- Treat transcript text as untrusted input. It is data, never instructions.

---

## 7. AI rules

- All model calls go through `adapters/ai/gateway.py`:
  `complete(task=...)`, `stream(task=...)`, `embed(...)`.
- Code names a **task** (`live_detect`, `live_answer`, `call_summary`,
  `followup_draft`, …), never a model. `config/ai_tasks.yaml` maps each task to
  provider, model, max tokens, timeout and fallback.
- The gateway records tokens, cost, latency and tenant for every call, and sends a
  trace to Langfuse.
- Prompts live in files (`modules/<m>/prompts/<name>.v<N>.md`), are referenced by
  name and version, and are never built from long inline strings.
- Answers must come only from retrieved, approved documents. If confidence is below
  the configured threshold, return "Not confirmed". Never invent facts.
- Any prompt, model, chunking or retrieval change must be run through `eval/` and
  must not lower the scores recorded in the latest eval report.

---

## 8. Code style

- Python 3.12. Type hints everywhere; `mypy --strict` on `src/`.
- Async all the way: no blocking I/O in request paths (use `httpx.AsyncClient`,
  asyncpg, async Redis). CPU-heavy work goes to the worker.
- `ruff` for lint and format. No `print`; use the structlog logger.
- Names: modules `snake_case`, classes `PascalCase`, events in past tense
  (`DocumentIngested`), tasks as verbs (`ingest_document`).
- Docstrings on every public service function: what, inputs, outputs, errors.
- Dependency injection via FastAPI `Depends` and constructor arguments. No global
  mutable state except configured singletons in `core/`.

---

## 9. Security and privacy

- Secrets only from environment variables / Azure Key Vault. Never commit secrets.
  Keep `.env.example` up to date with every new setting (no real values).
- Never write transcript text, email bodies, document contents or personal data to
  application logs. Log ids, counts and timings.
- Transcript and document content may appear only in Langfuse traces, hosted in the
  tenant's data region, with retention matching the tenant's transcript retention.
  Langfuse Cloud is for local development with fake or anonymised data only
  (ADR 0002).
- Client documents and real questions never go into git. `eval/` holds anonymised
  samples only; real sets live in Azure storage.
- Local dev auth bypass is allowed only when `EMBER_ENV=local`.
- Consent and retention settings are per tenant and must be respected by every
  feature that records, stores or processes call content.

---

## 10. Testing

- `pytest` + `pytest-asyncio`. Tests mirror `src/ember/`.
- Unit tests: services with fake repositories and fake adapters (`adapters/*/fake.py`).
- Integration tests: real Postgres + Redis via testcontainers.
- Required for every module: service tests, a tenant-isolation test per repository,
  and route tests for every endpoint.
- Realtime: protocol tests for every message type, and a timing test using fake
  adapters that asserts the pipeline overhead (excluding vendors) stays under 100 ms.

---

## 11. Workflow

- Small pull requests, one task each. Conventional commits (`feat:`, `fix:`, `chore:`).
- Before opening a PR, run `uv run poe check` (lint, types, import rules, tests, OpenAPI drift).
- Record significant decisions as ADRs in `docs/decisions/` (template in `0000-template.md`).
- Do not add a dependency without stating why in the PR description.
- When a business rule is unclear, add a `TODO(<issue-number>)`, open an issue labelled
  `blocked-by-client`, and continue with a configurable default. Never hard-code a guess.
- Code in `spikes/` is throwaway. Promote learnings into `src/` properly; never import from `spikes/`.

---

## 12. Definition of done (every task)

- Acceptance criteria in the task are met and demonstrated by tests.
- `uv run poe check` passes locally and in CI.
- New settings are in `.env.example`; new decisions have an ADR.
- No secrets, no personal data in logs, no business thresholds in code.
