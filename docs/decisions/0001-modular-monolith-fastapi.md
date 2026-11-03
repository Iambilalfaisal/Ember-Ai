# 0001. Modular monolith on FastAPI

- Status: accepted
- Date: 2026-11-03

## Context

Ember serves 5-6 reps for the first customer and must later serve many companies
(tenants). The team is small. Live-call answers are latency-sensitive, while
background work (summaries, syncs, nurturing rules) is not, and the two scale
differently.

## Decision

Build one Python 3.12 codebase (FastAPI, Pydantic v2, async SQLAlchemy 2.0 on
PostgreSQL 16 + pgvector) organised as a modular monolith, run as three processes
from the same code: `api` (HTTP), `realtime` (WebSocket live-call sessions) and
`worker` (Taskiq background jobs on Redis).

- Business code lives in `modules/<name>/`, each with the same layout. A module may
  import another only through `ember.modules.<other>.public`; import-linter enforces it.
- `core/` holds shared platform code and `adapters/` holds everything external behind
  interfaces. Neither imports from `modules/`.
- Every business table carries `tenant_id`, and all tenant data goes through
  `TenantScopedRepository`.
- Modules prefer events over direct calls when the caller needs no answer.

## Consequences

- One deployable artifact and one transaction boundary keep early development fast.
- Module boundaries make a later extraction into a separate service a mechanical
  change rather than a rewrite.
- The three processes scale independently (users, concurrent calls, queue depth).
- Boundary discipline relies on CI (import-linter), not on the runtime.
- Cheap-to-add-later items are deferred on purpose: row-level security, outbox,
  partitioning, read replicas, multi-provider fallback and autoscaling rules.

## Alternatives considered

- **Microservices from day one:** more operational cost and cross-service contracts
  than a 5-6 rep customer justifies.
- **Single unstructured monolith:** fastest at first, but tenant scoping and module
  boundaries are expensive to retrofit.
- **Django:** weaker fit for async-first streaming and WebSocket workloads.
