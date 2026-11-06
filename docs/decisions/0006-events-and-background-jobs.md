# 0006. Events and background jobs

- Status: accepted
- Date: 2026-11-06

## Context

Modules must react to each other without calling each other (AGENTS.md section 2, rule 5), and
slow or retryable work must leave the request path. F5 adds both: domain events, and background
jobs on Taskiq with Redis. The foundation plan asks for events that are delivered only after the
transaction commits.

## Decision

### Events

- **Shape:** `Event` is a frozen Pydantic model with `tenant_id`, `event_id` and `occurred_at`.
  Names are past tense, payloads are ids and small facts, never personal data. Handlers run with
  the event's tenant as the current tenant.
- **Unit of work:** `bus.unit_of_work()` collects events published inside it, delivers them if the
  block ends normally and drops them otherwise. `core.db.transaction()` wraps a session in one, and
  commits before the block ends, so delivery happens after the commit, and never when the work
  raised or the commit failed. Requests (`get_session`) and jobs (`JobSession`) both use it.
  Publishing outside a unit of work raises `NoUnitOfWork` instead of silently dropping.
- **Delivery:** in-process, in publication order, handlers in registration order. A handler that
  fails is logged (ids, handler name, traceback, never the payload) and does not affect the
  committed request or the other handlers. A handler may not publish further events (it runs
  after its unit of work ended); it starts a job instead.
- **No outbox yet:** events are not stored. If the process dies between the commit and the
  delivery, the event is lost. That is acceptable while handlers only start jobs for best-effort
  follow-up. A consumer that needs a guarantee should get an outbox table written in the same
  transaction; the bus interface does not need to change for that.
- **Registration:** each module's `events.py` has `register_handlers(bus)`, called by every
  entrypoint through discovery, like routers. Other modules subscribe to a module's events
  through its `public.py`.

### Jobs

- **Declaring and sending:** `@task("module.verb")` records a task; `Task.enqueue(...)` sends it.
  Nothing reads settings at import time. An entrypoint builds the broker and binds the registry
  to it, so the API (which enqueues) and the worker (which runs) share definitions. Arguments
  are checked against the signature at enqueue time.
- **Tenants:** a task is tenant-scoped by default. It must take `tenant_id`, and runs with that
  tenant current, so repositories behave as in a request. A scheduled (`cron`) task has no tenant;
  it enqueues one tenant-scoped task per tenant.
- **Transactions:** `JobSession` is the job's one transaction, committed if the task succeeds and
  rolled back if it raises; events published by the task are delivered after the commit.
- **Broker:** Taskiq on Redis streams, with a result backend. A message is acknowledged once its
  result is saved, so delivery is at least once and tasks must be safe to run twice.
- **Process layout:** `taskiq worker ember.entrypoints.worker:create_broker` and
  `taskiq scheduler ember.entrypoints.worker:create_scheduler` (`uv run poe worker`,
  `uv run poe scheduler`). Taskiq calls the factories, so settings are read when the process
  starts, not when a module is imported. Module task discovery is by import of each `tasks.py`,
  not by Taskiq's file-system discovery, which would import files under a second module name.
- **Example:** `identity` publishes `UserInvited`; its handler enqueues `identity.log_user_invited`,
  which looks the user up in a job session and logs the outcome (ids only).

## Consequences

- A slow handler slows the request that triggered it, because delivery happens before the
  response is sent. Handlers should only enqueue work.
- No retries or dead-lettering are configured. A task that raises stores an error result and is
  acknowledged. A retry policy needs input on which jobs may be repeated and how often.
- The API process also holds a broker connection (to enqueue) and starts it with the app.
- Cron schedules are evaluated in UTC. Tenant time zones (`TenantSettings.timezone`) matter when
  the first daily job arrives.
- The generator now writes `register_handlers` into every new module's `events.py`.

## Alternatives considered

- **Delivering events from SQLAlchemy session hooks (`after_commit`):** ties events to the ORM and
  its sync hooks, which is awkward in async code, and makes delivery implicit.
- **Taskiq's own global `broker` and `@broker.task`:** requires settings at import time, which
  breaks importing modules in tests and the API without a Redis URL.
- **Delivering events in a FastAPI background task after the response:** hides handler cost from
  the client, but a failure then has no request to attach to and tests are harder to write.
- **`ListQueueBroker` (pop on receive):** simpler, but a worker crash loses the message.
