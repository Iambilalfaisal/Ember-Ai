# web

The Ember web app: Next.js 16, React 19, TypeScript (strict), Tailwind 4. It is built to
[`docs/frontend-plan.md`](../docs/frontend-plan.md) and looks and speaks as defined in
[`docs/ui-design-prompt.md`](../docs/ui-design-prompt.md). The rules are in AGENTS.md section 13.

## Run it

From the repo root:

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm check      # lint, format check, typecheck, unit tests
pnpm build
pnpm e2e        # Playwright; install a browser once with: pnpm --filter @ember/web exec playwright install chromium
```

## Layout

```
web/src/app          routes only, no logic
web/src/features/    one folder per feature, each with a public index.ts
web/src/components/  shared components
web/src/providers/   the only place that may start the mock backend
web/src/lib/         small helpers
packages/ui          design tokens and components
packages/api         typed data hooks (and the mock backend from FE2)
packages/live        the live call panel, shared with Electron
```

Features import each other only through `index.ts`. `pnpm lint` fails if they do not.
