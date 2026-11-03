# 0002. Langfuse hosting

- Status: accepted
- Date: 2026-11-03

## Context

Ember traces every AI call in Langfuse (prompts, outputs, tokens, cost, latency).
Those traces contain transcript text and document content, which is customer data
subject to each tenant's data-region and retention settings. Application logs must
never contain that content (AGENTS.md section 9), so Langfuse is the one place it
may appear.

Developers need tracing locally without running a heavy stack: self-hosted Langfuse v3
needs Postgres, ClickHouse, Redis and object storage.

## Decision

- **Local development:** use Langfuse Cloud, configured through `.env`
  (`EMBER_OBSERVABILITY__LANGFUSE_*`). Only fake or anonymised data may be sent to it.
  No Langfuse containers in `infra/docker-compose.yml`.
- **Staging and production:** self-hosted Langfuse v3 deployed in the tenant's Azure
  region, so trace content stays in the tenant's data region. Trace retention matches
  the tenant's transcript retention.
- Transcript and document content may appear only in Langfuse traces hosted in the
  tenant's data region, and never in application logs.

## Consequences

- Local setup stays light: Postgres and Redis only.
- Real customer data must never be used in local development, since it would leave the
  tenant's region. Eval and test data are anonymised (AGENTS.md section 9).
- We take on operating Langfuse v3 (ClickHouse, Redis, object storage) in Azure for
  staging and production, with per-region deployments as tenants in new regions arrive.
- The AI gateway must make the Langfuse host and keys configuration only, so each
  environment points at its own instance.

## Alternatives considered

- **Self-hosted Langfuse v2 in docker-compose:** simple, but v2 is the old architecture
  and would not match what staging and production run.
- **Langfuse Cloud everywhere:** least operational work, but customer content would leave
  the tenant's data region.
- **No tracing outside production:** developers could not debug prompts and retrieval
  locally.
