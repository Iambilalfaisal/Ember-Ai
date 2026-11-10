# 0009. Generated contracts

- Status: accepted
- Date: 2026-11-10

## Context

The desktop (Electron) and web (Next.js) clients are written in TypeScript against two backend
surfaces: the HTTP API and the live-call WebSocket protocol (AGENTS.md sections 5 and 6). If the clients
re-type those by hand, they drift from the backend silently. F8 makes the backend the single source:
the contracts are generated from it, committed in `contracts/`, and CI fails when they are stale.

## Decision

### What is generated, and from what

| Output | Built from | By |
|---|---|---|
| `contracts/openapi.json` | the API app's own OpenAPI document (`create_app(...).openapi()`) | `scripts/export_openapi.py` |
| `contracts/ts/api/schema.d.ts` | `openapi.json` | `openapi-typescript` |
| `contracts/ts/api/client.ts` | a fixed template: `createApiClient(options)` over `openapi-fetch` | `scripts/export_openapi.py` |
| `contracts/realtime/{client,server}.schema.json` | the Pydantic message models in `calls/live/protocol.py` | `scripts/export_openapi.py` |
| `contracts/ts/realtime/{client,server}.ts` | those two schemas | `json-schema-to-typescript` |
| `contracts/ts/realtime/constants.ts` | `protocol.constants()`: version, id pattern, close codes | `scripts/export_openapi.py` |

`uv run poe openapi` (from `backend/`) regenerates all of it. Nothing there is edited by hand;
`package.json`, `package-lock.json`, `tsconfig.json` and `README.md` are the only hand-written files.

### The protocol is described as it appears on the wire

Both directions are published as one `oneOf` per direction with a `type` discriminator, generated in
Pydantic's *serialization* mode with `json_schema_serialization_defaults_required` switched on. Fields that
have a default (`v`, `type`, `payload`, a nullable `card_id`) are always sent, so the schema lists them as
required: the receiver picks the model by `type`, so a sender that left `type` out would match nothing.
Without that setting the generated TypeScript would call those fields optional and mislead the desktop.

Pydantic's generated field titles ("Call Id", "Seq") are removed, because the TypeScript generator turns each
into a type alias and they collide across messages. The model titles stay and name the types. The server's
`Error` message is titled `ErrorMessage` in the schema, so the generated type does not shadow TypeScript's
own `Error`.

The protocol goes out through `modules/calls/public.py` (`live_protocol_schemas`, `live_protocol_constants`),
because `calls.live` is private to other code (ADR 0008) and the export script is "other code".

### Output must be reproducible

- Settings for building the app are fixed in the script (`env=test`, dummy URLs, no `.env`), so the output
  does not depend on the developer's machine, and building the app does no I/O.
- JSON is written with sorted keys, two-space indent and a trailing newline; every file is written with LF
  endings, also on Windows.
- The two generators and TypeScript are pinned to exact versions in `contracts/package.json` and
  `package-lock.json`, and installed on first use with `npm ci`. Node.js 20 or newer is needed.

### The drift check

`scripts/check_openapi_drift.py` (part of `uv run poe check`, and a CI step) regenerates into a temporary
folder and compares it, file by file, with `contracts/`. A file that is missing, stale or no longer generated
fails the check, naming the file. It does not use git, so a developer who has just run `poe openapi` passes
before committing. Line endings are normalised first.

Two pytest tests (`tests/test_contracts.py`) cover the JSON half without Node: the committed `openapi.json`,
the two realtime schemas and `constants.ts` must equal what the backend produces now. A plain `uv run poe test`
therefore catches a contract change that was not regenerated; only the TypeScript output needs the drift check.

## Consequences

- **A backend change that alters a contract shows up in the same pull request** as the regenerated files, and
  reviewers see the contract change as a diff of `contracts/`.
- **Node is now a development dependency** of the backend repository (for generation only; nothing in `src/`
  uses it). Contributors who only run tests do not need it, because of the two pytest tests above.
- **Dependencies added, and why:** `openapi-typescript` (OpenAPI to TypeScript types), `openapi-fetch` (a tiny
  typed `fetch` wrapper, so the "client" is a client and not only types), `json-schema-to-typescript` (the
  protocol schemas to TypeScript) and `typescript` (to type-check the generated code). All dev-time, all pinned.
- **Operation ids are verbose** (`read_me_api_v1_me_get`). The client addresses calls by path, so nobody types
  them. Shorter ids can come from setting `operation_id` on routes if a consumer ever needs them.
- **Error responses are not in the OpenAPI document yet.** Routes do not declare their 401, 403 or problem+json
  bodies, so the client cannot type them. Declaring them is a change to every route and belongs with the first
  client that needs to branch on an error.
- **The realtime schema is provisional** until the real pipeline exists (ADR 0008). This publishes it as it stands.

## Alternatives considered

- **Hand-written TypeScript types:** they drift, and nothing would notice.
- **Generate the client with `@hey-api/openapi-ts` or `orval`:** more output and more configuration than a
  two-method API needs; `openapi-typescript` plus `openapi-fetch` is small and has no runtime code of its own
  beyond `fetch`.
- **Python-only generation (for example `datamodel-code-generator`, `pydantic2ts`):** produces Python models, or
  needs the same Node tool underneath. `json-schema-to-typescript` is what `pydantic2ts` calls anyway.
- **Compare with `git diff` in the drift check:** compares against the index, so a freshly regenerated but
  unstaged contract would fail, and a new generated file would not be noticed at all.
- **One combined realtime schema file:** the two directions share no types, and one file per direction gives the
  desktop an obvious `ClientMessage` and `ServerMessage`.
- **A pytest test for the TypeScript too:** it would make every test run need Node.
