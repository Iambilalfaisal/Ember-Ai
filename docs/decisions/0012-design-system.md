# 0012. The design system (`@ember/ui`)

- Status: accepted
- Date: 2026-11-10

## Context

FE1 turns `docs/ui-design-prompt.md` into code: tokens, primitives and the Ember components, shown on a
`/design` route. Later screens build only from these, so the choices here carry through the whole demo.

## Decision

### Tokens live in CSS, mirrored in TypeScript

`styles/tokens.css` holds the colours as CSS variables for light and dark, and `tokens.ts` holds the same values
for tests and for the `/design` table. A test checks the two agree. Dark follows the system setting unless
`data-theme` is set on `<html>`. Tailwind utilities (`bg-ash`, `text-glow-ink`, `rounded-panel`, `shadow-float`)
read the variables, so a theme change needs no rebuild. The default Tailwind palette is switched off, so a stray
`bg-blue-500` does not compile to anything.

### Contrast findings and what we did about them

The specified palette was measured, not assumed (`tokens.test.ts`, and axe in `web/e2e/design.spec.ts`). Two pairs
fall short of WCAG 2.2 AA, so the tokens stay as specified and the components avoid the pairs:

- `glow` on white is 2.2:1, below the 3:1 needed for a graphic. The warm dot has a `glow-ink` outline.
- `flare` text on `ash` is 4.2:1, below 4.5:1. Flare text only appears on `paper` (the overdue pill has its own
  paper background).

Also worth knowing: `moss` (4.0:1 on white) and `frost` (3.3:1) pass for graphics but not for text, so they only
colour dots, icons and edges. `cinder` lines are 1.4:1, fine for dividers, so form fields use a `smoke` border.

### Primary buttons are neutral

The token table lists glow for "primary accent fills", but the concept says warmth must stay meaningful. Primary
buttons are `coal` (ink on `paper` in dark). Glow is used only for the warm state and the live answer edge. Easy to
change in one place (`buttonVariants`) if the client wants an accent.

### Tabular numbers only where numbers line up

Schibsted Grotesk has a `tnum` feature, so Instrument Sans is not needed. But `tnum` also widens commas and full
stops, which looks wrong in running text. So tabular figures are applied per element (timers, metrics, tables), not
on the whole page.

### Motion

Animations are CSS keyframes (`styles/motion.css`): the ignite edge, the breathing listening dot, sheets, dialogs
and popovers. Springs (list reflow, drag) are presets in `motion.ts` for the `motion` library, used from FE4. Reduced
motion turns every animation into an instant change, from the system setting or from `data-motion="reduce"` on
`<html>`, which `/design` uses to demonstrate it. Streaming text keeps streaming, without the sweep.

### Dependencies

`radix-ui` for behaviour and keyboard handling of tabs, dialogs, popovers, tooltips, switches and toggle groups.
`class-variance-authority`, `clsx` and `tailwind-merge` for variants. `lucide-react` for icons. `motion` for springs.
`@fontsource-variable/schibsted-grotesk` so the font is bundled and no build step reaches Google Fonts.
The trend chart is plain SVG, so no charting library yet.

### Rules checked by tests

`writing-rules.test.ts` scans component source for middle-dot metadata, arrows, all-caps classes, gradients,
shimmer and raw hex colours.

## Consequences

- `tailwind-merge` must know about the custom `text-detail` size, or it drops the colour next to it
  (`lib/cn.ts`, with a test). Add any new custom size there.
- Components are built to the spec, not to shadcn's defaults, so upgrading Radix is the only maintenance.
- `MetricTile` is deliberately not a card, so tiles stay a pipeline-board thing.
