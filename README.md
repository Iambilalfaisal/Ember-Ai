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
uv run poe check                 # lint, types, import rules, tests, OpenAPI drift
uv run poe                       # list all tasks
```

Calling the API locally without Entra: put a dev signing key in `.env` (see `.env.example`),
then send `Authorization: Bearer <token>` with a token from
`uv run python scripts/dev_token.py --role admin`. Dev tokens work only when `EMBER_ENV=local`
([ADR 0004](docs/decisions/0004-tenancy-and-authentication.md)).
