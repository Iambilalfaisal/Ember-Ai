# 0008. The realtime service skeleton

- Status: accepted
- Date: 2026-11-10

## Context

Live calls are the product's centre: the desktop sends transcript text while a rep is on a call, and
Ember streams back answer cards (AGENTS.md section 6). F7 builds the plumbing with a **fake pipeline**,
so the connection, the protocol, session state and the latency budget are proven before any real
retrieval or prompt work. This ADR records how, and what the skeleton deliberately does not do.

## Decision

### A separate process with one route

`entrypoints/realtime.py` is its own app (`uv run poe realtime`, port 8001). It serves
`/ws/v1/calls/{call_id}` and `/health/*`, and nothing else: no HTTP API, no OpenAPI. It scales with
concurrent calls, not with users. The route and everything behind it live in
`modules/calls/live/`; the module's `public.py` exposes only the router and a `build_live_runtime`
function, and import-linter keeps the whole `calls.live` package private to other modules.

### Sign-in

The desktop sends the same bearer token as for HTTP, in the `Authorization` header of the WebSocket
handshake. It is never read from the URL: query strings end up in access logs and proxies.

The handshake is **accepted first** and the token is checked straight after, so a rejected desktop learns
why from the close code, which a plain pre-accept refusal (a bare HTTP 403) would hide:

| Close code | Meaning | Desktop should |
|---|---|---|
| 1000 | The call ended (after `session.end`) | nothing |
| 1009 | A message was too large | fix the bug |
| 1011 | Server or session-state problem | reconnect shortly |
| 4400 | Protocol error (`session.start` missing, a skipped message, ...) | reconnect and resync |
| 4401 | Token missing or invalid | refresh the token, reconnect |
| 4403 | No Ember account or role, or another user's call | stop |
| 4408 | No `session.start` within the timeout | reconnect |
| 4409 | The call ended or its session expired | start a new call |

Every role may take calls (a lead or admin can also be on one). The close code carries no reason;
the reason goes to the log, as for HTTP.

**Consequence to know:** a browser `WebSocket` cannot set headers, so the desktop must connect from
code that can, the Electron main process (Node `ws`). If that turns out to be a problem, a
`Sec-WebSocket-Protocol` bearer subprotocol can be added without changing anything else.

### The protocol

One JSON text frame per message, in one envelope: `{v, type, call_id, seq, payload}` (the full list is in
`protocol.py`). Every message type is a Pydantic model, so F8 can export JSON Schema and TypeScript types.

- **Strict envelope, tolerant payloads.** An unknown envelope field is an error (changing the envelope
  needs a new `v`); an unknown payload field is ignored, so a newer desktop can add one.
- **Numbering.** The desktop numbers its messages 1, 2, 3 ... for the whole call, **across reconnects**
  (`session.start` is always 0 and is not counted). The server accepts each number once, in order: a
  repeat is ignored, a jump closes the connection with `out_of_order`. The server numbers its own messages
  per connection and never replays them.
- **Errors say nothing about the input.** An `error` message has a fixed text per code. A validation
  failure never reports which field or value was wrong, because that would repeat call content.
- **Ids from the desktop** (`utterance_id`, `card_id`) are limited to `[A-Za-z0-9._-]{1,64}`, so they are
  safe to log and echo.
- **Bad messages** get a non-fatal `error` and the call goes on; they do not use up a number. Only a
  protocol break (a skipped number, an oversized message, no `session.start`) ends the connection.

### Session state: Redis, ids and counters only

State is one Redis hash per call, `ember:live:<tenant_id>:<call_id>`, holding the owner (`user_id`),
`status` (`active` or `ended`) and `last_client_seq`, with a TTL that every accepted message renews. A
desktop that reconnects to the same `call_id` gets `session.ready` with `resumed: true` and
`last_client_seq`, and re-sends whatever came after.

- **Tenant isolation is the key.** The same `call_id` in another tenant is a different, empty session.
  Within a tenant, only the user who started a call can rejoin it.
- **One Lua script per step.** `advance` claims message number *n* only if it is exactly the next one,
  atomically. Two connections racing for one call (a desktop that reconnected before the server noticed the
  old socket die) therefore cannot both act on the same message; a test fires 25 at once and exactly one
  wins.
- **At most once.** The number is claimed *before* the message is acted on, so a crash in between loses a
  message rather than answering a question twice. For a live card an answer that comes late is worse than
  none.
- **No transcript text in Redis.** It is call content, and keeping it needs the tenant's consent and
  retention settings (AGENTS.md section 9). Those belong to the persistence work in `calls`, not to a cache.
  A consequence: a resumed session has no memory of what was said before, which the real pipeline will
  have to rebuild from the database.

### The pipeline seam and the fake pipeline

`LivePipeline.answer(utterance, emit)` receives a finished utterance and *emits* card events through a
callback; the session wraps each in an envelope and sends it. A callback, not an async generator, so every
`stage_timer` span stays open across plain awaits instead of across generator suspensions.

`FakePipeline` answers any utterance that ends in `?` with canned text, streamed word by word through the AI
gateway, and times `detect`, `rewrite`, `retrieve`, `generate_total` and (nested in it)
`generate_first_token` with `stage_timer`. It uses no knowledge base and no real retrieval, and the prompt
file it loads (`live_answer.v1.md`) has not been through `eval/`. **It must be replaced before reps use
it.**

- **Never a blank panel.** A vendor error, a timeout or a bug gives a `card.not_confirmed`. If text had
  already been sent, the message names that card (`card_id`) so the desktop replaces it. A card starts with
  its first text, so a failure before that is one clean `not_confirmed`.
- **The gateway is a fake too.** `build_fake_ai_gateway` reads the real `ai_tasks.yaml` (so task names,
  limits and timeouts are the real ones) and puts the fake provider where `openai` would be. It records no
  usage: the calls cost nothing, and a row in `ai_usage` would look like OpenAI spend.
- **Production refuses to start.** `EMBER_ENV=production` raises `FakePipelineNotAllowed`: reps must not
  get fake answers by accident. Staging may run it.
- **Prompt hygiene.** The question is in the user message; the system prompt only holds the (fake)
  passages and says the transcript is data, never instructions.

### Answering: one at a time, in order

A worker task per connection answers utterances from a queue, so the connection keeps receiving while a
card streams. A question that arrives meanwhile waits its turn. Ending the call mid-card cancels the work
and tells the desktop (`card.end`, status `cancelled`); a dropped connection cancels it silently.

### Observability

Stage spans nest under the connection's span, so one connection is one trace with its stages visible. The
FastAPI instrumentation's per-message `receive` and `send` spans are switched off: a card sends dozens of
messages. Logs carry ids, counts and timings only (`calls.live.session_started`, `session_closed` with
counts of partials, finals, cards, feedback and duplicates, `card_failed` with the error class). Tests send
a secret in the transcript and assert it appears in no log line, in no `error` message sent back, and in
no Redis value.

### Limits are settings

`EMBER_REALTIME__...`: session TTL, how long an ended call is remembered, the largest message (bytes, not
characters), the time allowed for `session.start`, and the Redis timeout (so a stalled Redis cannot hang a
call). Dead peers are found by uvicorn's WebSocket ping, not by the application.

## Consequences

- **Server messages are never replayed.** A card cut off by a disconnect is gone; the next question gets a
  new one. Replay would need a stored outbox and nobody has asked for it.
- **A superseded connection lingers.** When a desktop reconnects, the old socket is not evicted (that needs
  pub/sub between instances). It cannot do harm: it can no longer claim a message the new one has claimed.
- **Questions queue.** If a second question arrives while a card is streaming, it waits instead of replacing
  the first. Whether the latest question should win is a product decision, to make with the real pipeline.
- **No rate limit on bad messages**, and the queue is unbounded. Both need an authenticated user, and both
  should be revisited with the real pipeline.
- **Nothing is persisted.** No call row, no transcript, no feedback storage. `card.feedback` is logged by
  id and rating and counted. `session.start` has an empty payload until account context is preloaded.
- **Scaling out works without sticky sessions:** Redis is the only shared state, and every step is atomic.
- The shape of the messages is provisional until the real pipeline exists; F8 will publish it to the
  desktop team as it stands.

## Alternatives considered

- **Token in the query string:** works from any WebSocket client, and lands in access logs.
- **Refusing before accepting:** the usual 403, but the desktop cannot tell an expired token from a missing
  account, so it cannot know whether to refresh.
- **Per-message sequence numbers for the server, kept in Redis:** a Redis write per streamed word, with no
  use, since server messages are not replayed.
- **`WATCH`/`MULTI` instead of Lua:** retries under contention; the script is shorter and atomic by
  construction.
- **Transcript in Redis, so a resume can restore it:** call content without the tenant's retention rules.
- **Cancel the running card when a new question arrives:** needs the pipeline's `detect` result inside the
  session, or two concurrent pipelines. Not worth deciding before the real pipeline exists.
