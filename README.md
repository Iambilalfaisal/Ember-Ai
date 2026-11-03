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
uv run poe check                 # lint, types, import rules, tests, OpenAPI drift
uv run poe                       # list all tasks
```
