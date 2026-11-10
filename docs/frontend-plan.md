# Ember — frontend plan (demo-ready MVP UI on mock data)

Goal: a professional, modern, animated frontend that demonstrates **every module**
in the PRD end to end, running entirely on mock data. It must be the **real
frontend architecture**, not a throwaway prototype: when the backend endpoints
exist, we switch the data source from mock to live without rewriting screens.

Read `AGENTS.md` and `docs/ui-design-prompt.md` before starting. Do the tasks in
order (FE0–FE9). One branch and pull request per task. A task is finished only
when every "Done when" item is true and `pnpm check` passes.

---

## 1. Principles

1. **One seam for data.** Screens never import mock data. They call hooks from
   `@ember/api`. Behind those hooks, Mock Service Worker (MSW) answers in demo
   mode; the real backend answers in live mode. Switching is one env variable:
   `NEXT_PUBLIC_API_MODE=mock | live`.
2. **The mock behaves like a backend.** An in-memory database holds the demo world.
   Actions persist for the session (mark handled, approve summary, move a deal), and
   one action updates every screen that depends on it. A "Reset demo" control
   restores the starting state.
3. **Realistic, not magical.** Mock responses have realistic latency (200–600 ms),
   live answers stream in about 1.5–2.5 s, and the demo includes a "Not confirmed"
   case. The demo must never promise more than the real product will do.
4. **Typed end to end.** TypeScript strict. Every domain object has a Zod schema in
   `@ember/api`; these schemas are the draft API contract for the backend.
5. **Features are modules.** Same idea as the backend: each feature folder has a
   public `index.ts`; features never import each other's internals (enforced by
   ESLint boundaries).
6. **The live call panel is shared.** It lives in `packages/live`, so the web demo
   and the future Electron desktop app use the same code.

---

## 2. Stack

| Area | Choice |
|---|---|
| Package manager | pnpm workspaces (frontend); backend keeps uv |
| App framework | Next.js, latest stable, App Router, React 19 |
| Language | TypeScript strict |
| Styling | Tailwind CSS v4 with CSS-variable design tokens |
| Components | shadcn/ui on Radix primitives, restyled to the Ember design system |
| Motion | Motion (`motion/react`) for layout, presence and gesture animation |
| Server state | TanStack Query v5 |
| UI state | Zustand (role switcher, demo controls, panel state only) |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table v8 |
| Drag and drop | dnd-kit (pipeline board) |
| Charts | Recharts, styled with design tokens |
| Icons | lucide-react |
| Toasts / command palette | sonner, cmdk (via shadcn Command) |
| Mocking | MSW v2 + `@mswjs/data` in-memory DB + `@faker-js/faker` with a fixed seed |
| Dates | date-fns |
| Tests | Vitest + Testing Library (units), Playwright (demo-flow end-to-end) |
| Lint / format | ESLint (with `eslint-plugin-boundaries`), Prettier |

---

## 3. Folder structure

```
ember/
├── pnpm-workspace.yaml             # web, desktop, packages/*
├── web/                            # Next.js app (all screens)
│   ├── src/
│   │   ├── app/                    # routes only: thin, compose features
│   │   │   ├── (auth)/sign-in/
│   │   │   ├── (app)/layout.tsx    # app shell
│   │   │   ├── (app)/my-day/
│   │   │   ├── (app)/team/         # Leader View
│   │   │   ├── (app)/revival/
│   │   │   ├── (app)/pipeline/
│   │   │   ├── (app)/deals/[dealId]/
│   │   │   ├── (app)/contacts/
│   │   │   ├── (app)/tasks/
│   │   │   ├── (app)/calls/                    # call library
│   │   │   ├── (app)/calls/[callId]/           # call detail + transcript
│   │   │   ├── (app)/calls/[callId]/review/    # post-call summary approval
│   │   │   ├── (app)/calls/[callId]/prep/      # pre-call brief + call plan
│   │   │   ├── (app)/live/[callId]/            # live call demo (stage + panel)
│   │   │   ├── (app)/knowledge/
│   │   │   ├── (app)/knowledge/test/           # ask-the-knowledge-base console
│   │   │   ├── (app)/reports/
│   │   │   ├── (app)/settings/[section]/
│   │   │   └── design/                         # living style guide
│   │   ├── features/
│   │   │   ├── my-day/
│   │   │   ├── team-view/
│   │   │   ├── revival/
│   │   │   ├── drafts/             # draft message composer (shared by several screens)
│   │   │   ├── pipeline/
│   │   │   ├── deals/
│   │   │   ├── contacts/
│   │   │   ├── tasks/
│   │   │   ├── calls/              # library, detail, review, prep
│   │   │   ├── knowledge/
│   │   │   ├── reports/
│   │   │   ├── settings/
│   │   │   └── demo/               # role switcher, demo controls, guided tour
│   │   ├── components/             # app-level: shell, nav, command palette, page header
│   │   ├── providers/              # query client, theme, MSW bootstrap, toasts
│   │   └── lib/                    # formatters, route helpers
│   └── e2e/                        # Playwright demo-flow tests
├── packages/
│   ├── ui/                         # design system: tokens, primitives, Ember components, motion presets
│   ├── api/                        # Zod domain schemas, typed client, Query hooks, MSW handlers, fixtures
│   │   └── src/
│   │       ├── domain/             # schemas + types (draft API contract)
│   │       ├── client/             # fetch client (mock and live use the same calls)
│   │       ├── hooks/              # useMyDay(), useApproveSummary(), ...
│   │       ├── mock/
│   │       │   ├── db.ts           # @mswjs/data models
│   │       │   ├── seed/           # the demo world (see §6)
│   │       │   ├── handlers/       # one file per resource
│   │       │   └── realtime/       # scripted live-call player
│   │       └── index.ts
│   └── live/                       # live call panel (shared by web demo and Electron)
│       └── src/
│           ├── panel/              # transcript, cards, controls
│           ├── session/            # LiveSession interface + mock implementation
│           └── index.ts
├── desktop/                        # Electron (later: renders packages/live)
└── contracts/                      # generated from backend OpenAPI (already exists)
```

### Feature folder layout (always the same)

```
features/<name>/
├── index.ts            # public exports only (screens, shared components)
├── components/         # feature components
├── screens/            # one component per route, composed from components
├── hooks/              # feature-specific UI hooks (data hooks live in @ember/api)
└── copy.ts             # user-facing strings for this feature
```

### Frontend rules (add to AGENTS.md as §13)

- Routes in `app/` contain no logic: they render a screen from a feature.
- Features import other features only via their `index.ts`.
- Components never import from `packages/api/src/mock`. Data comes only from `@ember/api` hooks.
- All colours, radii, shadows, spacing and motion come from `@ember/ui` tokens. No raw hex values in feature code.
- Every screen has loading (skeleton), empty and error states.
- Every interactive element is keyboard reachable with a visible focus style.
- All motion respects `prefers-reduced-motion`.
- User-facing text follows the writing rules in `docs/ui-design-prompt.md`.

---

## 4. The live call simulation

`packages/live` defines one interface used by the panel:

```ts
interface LiveSession {
  start(callId: string): Promise<void>;
  on(event: LiveEvent["type"], handler: (e: LiveEvent) => void): () => void;
  sendFeedback(cardId: string, verdict: "useful" | "wrong"): void;
  end(): Promise<void>;
}
```

`LiveEvent` uses the same message types as the backend realtime protocol
(`session.ready`, `transcript.partial`, `transcript.final`, `card.start`,
`card.delta`, `card.end`, `card.not_confirmed`, plus `suggestion.next_question`,
`card.objection`, `alert.contradiction`). Import them from `contracts/` where they
exist; define the rest in `@ember/api/domain/live.ts` and flag them for the backend.

`MockLiveSession` plays a **scenario file** (`mock/realtime/scenarios/*.json`): a
timeline of events with millisecond offsets. Transcript partials stream word by word;
card text streams token by token. Demo controls: play, pause, restart, speed (1×, 2×).

---

## 5. Screens (every module in the PRD)

### Module A — Nurturing Copilot
- **My Day:** today's attention list. Each item: company, contact and role, stage,
  a plain-language reason, the suggested action, overdue indicator. Actions: view
  draft, view discovery notes, mark handled, snooze 3 days. Counts at the top update
  live when items are handled.
- **Discovery notes:** original notes with key phrases highlighted, and the extracted
  open question, next action and blocker, each editable.
- **Draft composer (side sheet):** AI draft with the facts it used shown as chips;
  edit, regenerate, copy, "Send with Outlook" (mock), sent state logged as an interaction.
- **Team view (Leader View):** filterable table of stalled and unassigned
  opportunities: rep, last meaningful interaction, next action, blocker, status;
  assign owner inline.
- **Revival Queue:** older opportunities with the original need and a suggested way
  back in; a quiet footer showing how many were excluded because the contact declined
  or opted out.

### Module B — Live Call Assistant
- **Upcoming calls** (on My Day and Calls): today's Teams meetings linked to deals.
- **Pre-call brief + call plan:** account summary, open questions, commitments,
  likely objections, suggested agenda.
- **Live call demo:** a mock Teams call stage (participant tiles, call controls) with
  the Ember panel docked to the right, exactly as it will sit beside Teams on Windows.
  The panel shows:
  - live transcript with rep and client clearly separated;
  - answer cards streaming in, each with its source document and section;
  - a "Not confirmed" card with a ready holding line;
  - a suggested next question;
  - an objection-handling card;
  - a contradiction alert against an earlier call;
  - useful / wrong feedback on each card;
  - a small "hidden from screen share" status, and a recording/consent status that
    reflects the tenant setting.
- **Post-call review:** draft summary (key points, client questions, commitments with
  dates, next action, blocker), all editable; approve → tasks created, deal updated,
  My Day refreshed; tailored follow-up draft ready.
- **Call library:** searchable list with filters (rep, account, date, outcome); call
  detail with transcript, summary and the cards shown during the call.

### Module C — Pipeline management
- **Pipeline board:** stages as columns, drag deals between stages (spring animation),
  stage totals.
- **Deals list** (table view of the same data) and **deal detail:** header with stage
  and owner, activity timeline (calls, emails, notes, stage changes), contacts, tasks,
  latest AI summary, upcoming call.
- **Contacts** and **Tasks** lists with filters.

### Knowledge base (admin)
- Documents list: type, version, status (active / inactive), last updated, owner;
  upload (mock), replace with a new version, deactivate.
- **Test console:** ask a question, see the streamed answer, the sources used, and
  the confidence; unanswerable questions return "Not confirmed".
- **Quality scorecard:** latest evaluation results (correct, grounded, Not confirmed
  accuracy, latency p50/p95).

### Reports
- Pilot metrics: answers used, answers correct, technical questions handled without a
  callback, time from call end to follow-up, overdue follow-ups per rep, deals moving
  to proposal. Trend charts by week.

### Settings
- Follow-up rules (thresholds per stage), consent and retention, integrations
  (ClickUp, Outlook, Teams — connected status), users and roles, AI usage and cost.

### Global
- Sign in with Microsoft (mock), app shell with collapsible navigation, command palette
  (Ctrl+K), notifications, light and dark themes.
- **Role switcher** (demo only): Sam Okafor (rep), Priya Nair (team lead), Alex Morgan
  (admin). Navigation and data change with the role.
- **Demo controls** (demo only): reset demo, play live call scenario, toggle latency.

---

## 6. The demo world (seed data)

One consistent fictional story, reused on every screen. Fix the inconsistency from
the original prototype: an opportunity flagged in My Day must also appear as needing
attention in Team view.

- Seller: the client's company (name from `NEXT_PUBLIC_DEMO_COMPANY`, default "Northwind Solutions").
- Reps: Sam Okafor, Jules Park. Team lead: Priya Nair. Admin: Alex Morgan.
- Opportunities: Meridian Robotics, Blue Harbor Logistics, Ferro Analytics, Solvex
  Manufacturing, Nimbus Freight (unassigned), Highline Freight (on track), plus revival
  candidates Coastal Parcel Systems, Tarnhelm Industrial, Ridgeline Foods, and
  Fernbridge Health (declined, excluded).
- One scripted live call: **Blue Harbor Logistics**, Tom Reyes (Director of Ops), with:
  an integration-timeline question (answered, with source), a security-certification
  question not covered by the documents ("Not confirmed"), a price objection, a
  contradiction (site count differs from the previous call), and a next-question
  suggestion.
- 8–12 knowledge-base documents with realistic titles and versions, one inactive.
- 6 weeks of report history.

All seed data is generated with a fixed faker seed so the demo is identical every time.

---

## 7. Tasks

### FE0 — Workspace and tooling
pnpm workspace; Next.js app in `web/`; `packages/ui`, `packages/api`, `packages/live`;
TypeScript strict; Tailwind v4; ESLint with boundaries rules; Prettier; Vitest;
Playwright; scripts `dev`, `build`, `lint`, `typecheck`, `test`, `e2e`, `check`;
frontend job added to CI.
**Done when:** `pnpm dev` serves a blank shell; `pnpm check` passes in CI; a deliberate
cross-feature internal import fails lint.

### FE1 — Design system (`packages/ui`)
Tokens from `docs/ui-design-prompt.md` (light and dark), fonts, motion presets,
restyled shadcn primitives, and the Ember components listed there. A `/design` route
shows every token and component in every state.
**Done when:** `/design` renders all components in both themes, with keyboard focus
and reduced-motion behaviour visible.

### FE2 — Mock data layer (`packages/api`)
Zod domain schemas; typed client; Query hooks for every resource; MSW handlers on an
`@mswjs/data` in-memory DB; seeded demo world; simulated latency; mutations that persist
for the session; reset; `NEXT_PUBLIC_API_MODE` switch.
**Done when:** hooks return seeded data in mock mode; a mutation in one hook is reflected
in another (e.g. approving a summary adds tasks and removes the My Day item); unit tests
cover handlers.

### FE3 — App shell and global features
Sign-in screen, shell, navigation, command palette, notifications, themes, role
switcher, demo controls.
**Done when:** every route in §3 is reachable from navigation or the command palette;
switching role changes navigation and data.

### FE4 — Module A screens
My Day, discovery notes, draft composer, Team view, Revival Queue.

### FE5 — Module B screens
`packages/live` panel and `MockLiveSession`; Blue Harbor scenario; live call demo
stage; pre-call brief; post-call review; call library and detail.
**Done when:** the full Blue Harbor scenario plays end to end and approving the summary
updates My Day, Tasks and the deal timeline.

### FE6 — Module C screens
Pipeline board, deals list, deal detail, contacts, tasks.

### FE7 — Knowledge base screens
Documents, versions, test console, quality scorecard.

### FE8 — Reports and settings
Reports with charts; all settings sections.

### FE9 — Demo polish
Guided demo path (§8) as an optional step-by-step tour; responsive down to 1280 px
for app screens and 380 px for the live panel; accessibility pass; reduced-motion pass;
Playwright test covering the full demo path.
**Done when:** the Playwright demo-path test passes twice in a row from "Reset demo".

Every screen task (FE4–FE8) is **done when:** the screen matches
`docs/ui-design-prompt.md`; it has loading, empty and error states; its actions work
against the mock DB; and it has at least one component test.

---

## 8. The demo path (what the client will see)

1. Sign in as Sam (rep). My Day shows 4 opportunities, each with a reason.
2. Open Meridian Robotics: discovery notes with highlights, extracted fields. Open the
   draft, edit a line, send. The item leaves the list and the count drops.
3. Open today's Blue Harbor call: pre-call brief and plan. Start the call.
4. Live call: the integration answer streams in with its source; the security question
   returns "Not confirmed" with a holding line; the price objection card appears; the
   contradiction alert fires; a next question is suggested.
5. End the call: review and approve the summary. Tasks appear; the follow-up draft is ready.
6. Switch to Priya (team lead): Team view shows Blue Harbor back on track; assign
   Nimbus Freight to Jules.
7. Revival Queue: Coastal Parcel with its suggested way back in; Fernbridge excluded.
8. Pipeline: drag Blue Harbor to Proposal; open the deal timeline showing today's call.
9. Switch to Alex (admin): knowledge base, deactivate an outdated document, ask a
   question in the test console.
10. Reports: pilot metrics trends.
