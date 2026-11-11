# 0013. Mock data layer

Status: accepted

## Context

The client demo runs on mock data, and the real backend will replace it later. Screens must not change when that happens.

## Decision

- `@ember/api` is the only way screens get data. It holds Zod schemas (the draft API contract), a typed client, and TanStack Query hooks.
- `NEXT_PUBLIC_API_MODE=mock|live` picks the backend. Mock is the default, so a missing value never reaches a real server. Live mode uses `NEXT_PUBLIC_API_URL`.
- In mock mode, MSW answers the same HTTP calls the live backend will. The provider loads the mock code on demand, so live builds do not ship it.
- State lives in an `@mswjs/data` in-memory database, used only as a store. It supports only primitive fields, so nested data (sections, transcript lines, facts) is stored as JSON strings and parsed by the Zod mappers.
- Handlers are hand-written. They check the user (`x-ember-user` header), the role, and the request body, and return one error shape: `{ error: { code, message } }`.
- Cross-screen consistency is done in the handlers, in one place (`mock/logic.ts`). Sending a draft, marking handled, and approving a summary all close the deal's My Day items and put it back on track. Team view reasons come from the same My Day items.
- Every successful write refreshes all loaded queries. The data set is small, and this cannot leave a screen stale.
- Seed data uses a fixed seed and dates relative to now, so the demo looks the same every time and never goes out of date.

## Consequences

- Moving to the real backend means changing the base URL, then fixing any schema that differs. Zod parsing on every response shows differences at once.
- Knowledge-base answers in mock mode come from keyword and hint matching, not retrieval. Questions outside the seeded documents return "Not confirmed".
- `LiveEvent` types for the live call (including suggested questions, objection cards, and contradiction alerts) are new and need agreeing with the backend. The scenario player that uses them arrives in FE5.
