# Ember-Ai
AI sales copilot: live call answers, post-call summaries and follow-up nurturing for sales teams.

## Local development

Rules for contributors and agents are in [AGENTS.md](AGENTS.md); the build order is in
[docs/foundation-plan.md](docs/foundation-plan.md). Backend commands run from `backend/`:

```
cd backend
uv sync                          # install dependencies
cp ../.env.example ../.env       # then edit it
uv run pre-commit install        # run ruff on every commit
uv run poe dev                   # start Postgres and Redis (needs Docker)
uv run poe migrate               # apply database migrations
uv run poe api                   # run the HTTP API (port 8000)
uv run poe worker                # run the background worker (needs Redis from `poe dev`)
uv run poe scheduler             # run periodic (cron) jobs, once any exist
uv run poe check                 # lint, types, import rules, tests, OpenAPI drift
uv run poe                       # list all tasks
```

Calling the API locally without Entra: put a dev signing key in `.env` (see `.env.example`),
create a tenant with `uv run python scripts/create_tenant.py --name "Demo" --admin-email you@example.test`
(it prints the ids and the exact `dev_token.py` command), then send
`Authorization: Bearer <token>`. Dev tokens work only when `EMBER_ENV=local`
([ADR 0004](docs/decisions/0004-tenancy-and-authentication.md)). New modules are generated with
`uv run python scripts/new_module.py <name>`; see [docs/architecture.md](docs/architecture.md).
