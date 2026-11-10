# contracts

What the backend promises its clients (desktop, web), generated from the backend itself
([ADR 0009](../docs/decisions/0009-contracts.md)). **Do not edit by hand**: `uv run poe openapi` (from
`backend/`) regenerates everything below, and CI fails if it is out of date.

```
contracts/
├── openapi.json                  the HTTP API (OpenAPI 3.1)
├── realtime/
│   ├── client.schema.json        live-call messages the desktop sends (JSON Schema)
│   └── server.schema.json        live-call messages the server sends
├── ts/
│   ├── index.ts                  everything below; `realtime` is a namespace
│   ├── api/                      typed HTTP client: createApiClient, paths, components
│   └── realtime/                 ClientMessage, ServerMessage, PROTOCOL_VERSION, CloseCode ...
├── package.json, package-lock.json, tsconfig.json     hand-written; the generators are pinned here
```

## Using it

HTTP, with every path, body and response checked:

```ts
import { createApiClient } from "@ember/contracts";

const api = createApiClient({
  baseUrl: "http://localhost:8000",
  headers: { Authorization: `Bearer ${token}` },
});
const { data, error } = await api.GET("/api/v1/me");
```

Live calls (connect from code that can set the `Authorization` header, such as the Electron main
process; see ADR 0008 for the close codes):

```ts
import { realtime } from "@ember/contracts";

const hello: realtime.SessionStart = {
  v: realtime.PROTOCOL_VERSION,
  type: "session.start",
  call_id: callId,
  seq: 0,
  payload: {},
};
socket.send(JSON.stringify(hello));

socket.on("message", (raw) => {
  const message = JSON.parse(String(raw)) as realtime.ServerMessage;
  if (message.type === "card.delta") append(message.payload.text);
});
socket.on("close", (code) => {
  if (code === realtime.CloseCode.UNAUTHORIZED) refreshTokenAndReconnect();
});
```

Every field in the generated types is always on the wire: send all of them, expect all of them.

## Regenerating

```
cd backend
uv run poe openapi          # rewrite contracts/
uv run poe openapi-check    # fail if contracts/ is out of date (also part of `uv run poe check`)
```

Needs Node.js 20 or newer. The first run installs the pinned generators with `npm ci`. To type-check the
generated TypeScript: `cd contracts && npm ci && npm run typecheck`.
