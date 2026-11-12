# 0014. App shell, roles and demo controls

Status: accepted

## Context

Every screen sits inside one frame. In the demo, one person must be able to show a rep, a team lead and an admin, and the navigation and the data must change with the person.

## Decision

- **One route table** (`web/src/lib/routes.ts`) drives the rail, the page titles, the role checks and the command palette. A test lists every route in the frontend plan and checks it has a title and is reachable.
- **Role = who is signed in.** The client sends the user id with every request, so switching person changes what the API returns. The role switcher is only the sign-in list shown again, and it exists only in demo mode.
- **A role that cannot open a page goes home and is told why.** This covers a rep who types `/team`, and a role switch while on a page the new role cannot see.
- **The shell does not import the demo feature.** The layout passes the role switcher, the demo controls and the command palette in as slots, so the shell follows the same import rules as every other component.
- **Preferences are saved in the browser.** Theme, collapsed rail and the response-delay switch use Zustand with `localStorage`. A short inline script sets the saved theme before the first paint, so a dark theme never flashes light.
- **Notifications come from the same data as every other screen.** The mock builds them from My Day, calls, unassigned opportunities and the knowledge base, and keeps read state per user. A new `GET /notifications` and `POST /notifications/read` are part of the draft API contract and need agreeing with the backend.
- **The style guide page skips the mock backend.** It shows static examples and renders at once.
- **Spacing is a 4 px grid.** `--spacing: 4px` is set in the theme. Tailwind's default (0.25rem) is 3.5 px at the design system's 14 px root size, which made every row and bar about 12% smaller than the design file asks for.

## Consequences

- Each route renders a placeholder that says the screen isn't built yet. A build step replaces one placeholder with the real screen and changes nothing in the shell.
- In live mode the role switcher and demo controls do not render, and sign-in becomes Microsoft sign-in.
- Bundling: `msw/browser` has no server build, so it is imported only behind a browser check, which the bundler removes from the server bundle.
