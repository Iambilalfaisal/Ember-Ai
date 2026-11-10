# 0011. The frontend workspace

- Status: accepted
- Date: 2026-11-10

## Context

The next milestone is a client demo of the product on mock data (`docs/frontend-plan.md`). The same code must
later run against the real backend, and part of it (the live call panel) must be shared with the Electron
desktop app. FE0 sets up the workspace so those later tasks have a place to go and rules that fail loudly.

## Decision

### One pnpm workspace

`web/` is the Next.js app. `packages/ui` holds design tokens and components, `packages/api` the typed data hooks
and, from FE2, the mock backend, `packages/live` the live call panel. `desktop/` joins in a later task. The
packages ship TypeScript source and Next compiles it (`transpilePackages`), so there is no build step per
package.

pnpm is pinned with `packageManager`, and `.npmrc` saves exact versions, so a fresh install gives the same tree
as CI. TypeScript stays on 5.9 for now: the toolchain around it (typescript-eslint, Next) has not settled on 7.

### The architecture rules are lint rules, and the rules are tested

`eslint-plugin-boundaries` enforces the layering of the plan: routes in `app/` hold no logic, features import
other features only through their `index.ts`, components never import features, and only `providers/` may touch
the mock. Two more rules ban imports from a `mock` folder or a package's `src`, and raw hex colours in app code.

The rules live in `eslint.architecture.mjs`. `web/tests/architecture.test.ts` runs the same rules against a
small fixture tree, so a change that stops a rule from catching a violation fails a test instead of passing
silently.

### One command, one gate

`pnpm check` runs lint, format check, typecheck and unit tests. CI runs it, then builds and runs the Playwright
test against the production build. A frontend task is done when its "Done when" items are true and `pnpm check`
passes.

## Consequences

- A cross-feature import into another feature's internals fails `pnpm lint`.
- `pnpm audit` reports one moderate advisory (minimatch, through `eslint-config-next`'s plugin chain). It is a
  dev-only dependency of the linter and never ships. Revisit when `eslint-config-next` updates it.
- Next writes `web/AGENTS.md` on `next dev`. It is committed so the working tree stays clean.
- `desktop/` is listed in `pnpm-workspace.yaml` before it exists. pnpm ignores a missing folder.
