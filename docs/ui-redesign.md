# UI redesign (deep indigo and violet)

This note replaces the colour, shape and motion rules in `docs/ui-design-prompt.md` sections 3 and 7 where they differ. Everything else in that document (writing rules, states, accessibility) still applies.

## Colour

Tokens live in `packages/ui/src/styles/tokens.css` and are mirrored in `packages/ui/src/tokens.ts`. A test keeps the two in step and checks WCAG contrast for every text and non-text pair.

- Surfaces: `ash` (page), `paper` (cards), `cinder` (borders). Text: `coal`, `smoke`.
- Accent: `iris` fill with `iris-fg` text on it; `iris-ink` for accent text on surfaces; `iris-wash` for soft highlights and selected rows.
- Rail: `nav`, `nav-ink`, `nav-muted`, `nav-accent`, `nav-hover`, `nav-active`. The rail is dark in both themes, and focus rings inside it use `nav-accent`.
- Warmth and state: `glow` (live AI arrival and heat), `frost`, `moss`, `flare` (errors and overdue only, on `paper`).
- Gradients are tokens (`bg-brand`, `bg-nav-rail`, `bg-hero`, `bg-page-glow`). Do not hand-write gradients in components.

## Shape and depth

Radii are 8 (controls), 14 (panels) and 20 (sheets). Cards use `shadow-card`; hover lift uses `shadow-lift`; overlays use `shadow-float`.

## Layout

- Navigation is grouped: Workspace, Sales, Insights, Manage (`NAV_GROUPS` in `web/src/lib/routes.ts`). The top bar shows the group above the page title.
- Lists, tables, charts and detail panels sit on cards (`Surface`, `ember-table-card`). Tables use `ember-table`.
- `PageHeader`, `Surface`, `Rise` and `Aura` are in `@ember/ui`.

## Motion

Purposeful, short and CSS-first: `ember-rise` for content arriving (translate with a very short fade, staggered by 60 ms up to 8 items), `ember-shimmer` for loading placeholders, `ember-aura` for the slow glow behind banners, and the existing ignite, breathe, sheet and dialog animations. Reduced motion (system setting or `data-motion="reduce"`) turns all of it off.
