# infra

Local development and deployment infrastructure.

`docker-compose.yml` starts Postgres (pgvector, host port 5433) and Redis (host port 6379). Start and stop them from
`backend/` with `uv run poe dev` and `uv run poe down`.

AI traces go to Langfuse Cloud during local development (fake or anonymised data only),
configured through `.env`. See `docs/decisions/0002-langfuse-hosting.md`. Azure templates
come later.
