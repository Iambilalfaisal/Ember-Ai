# Ember — UI design system and generation prompt

This file defines how Ember looks, moves and speaks. Every screen in
`docs/frontend-plan.md` must follow it. Section 9 is a self-contained prompt to
give an AI agent or UI generator before it builds any screen.

---

## 1. Who it is for and what it must feel like

- **Users:** sales reps (mostly non-technical) using it all day and during live
  Teams calls; team leads checking the pipeline; an admin managing documents.
- **Primary jobs:** know who needs attention today and why; get a trustworthy
  answer in two seconds during a call; follow through after it.
- **Feel:** calm, fast, confident and trustworthy. A tool a rep glances at mid-call
  without losing the thread. Professional enough to show a buyer, with one
  memorable signature instead of decoration everywhere.

## 2. The concept: deal temperature

The product is called Ember because it keeps leads warm. That metaphor is the
visual system, not just a logo:

- **Warm** means active and healthy (recent meaningful activity).
- **Cooling** means it needs attention (follow-up due, no next action).
- **Cold** means stalled or overdue.

Temperature appears as a small heat indicator on every opportunity, and as the
warm glow that marks AI output arriving live. Warmth means "alive and attended
to". Everything else in the interface stays neutral and quiet so that warmth is
always meaningful.

## 3. Tokens

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `ash` (background) | `#EEF0F2` | `#171C25` | app background |
| `paper` (surface) | `#FFFFFF` | `#1F2531` | panels, tables, sheets |
| `coal` (ink) | `#1E2430` | `#E8EAEE` | primary text |
| `smoke` (secondary ink) | `#5E6776` | `#A3AAB7` | secondary text, icons |
| `cinder` (line) | `#D8DCE2` | `#2E3542` | dividers, borders |
| `glow` (warm) | `#E9A23B` | `#F0AE4A` | warm state, live AI arrival, primary accent fills |
| `glow-ink` | `#8F560C` | `#F6C47A` | text that must read as warm (meets AA) |
| `frost` (cooling) | `#6F8FB8` | `#86A3C9` | cooling state, "Not confirmed" |
| `moss` (done) | `#3E8E6E` | `#5FB08E` | handled, approved, connected |
| `flare` (error) | `#C9443A` | `#E2685F` | errors and overdue badges only |

Rules: never put body text in `glow` on light backgrounds (use `glow-ink`).
No gradients as decoration. No raw hex in feature code.

### Type

- One family: **Schibsted Grotesk** (Google Fonts, variable), fallback
  `"Segoe UI", system-ui, sans-serif`. Numbers use `font-variant-numeric:
  tabular-nums`; if the font lacks tabular figures, use **Instrument Sans** instead
  for the whole system and note it in an ADR.
- Scale (px): 12, 13, 14 (default body), 16, 18, 20, 24, 32. Line height 1.5 for
  body, 1.25 for headings. Headings weight 600 with -0.01em tracking; body 400;
  emphasis 500.
- The live answer card is the largest reading text in the product: 18 px, weight 500,
  line height 1.45, max 60 characters per line.
- Line length under 80 characters everywhere text is read.

### Shape and depth

- Radii follow hierarchy, not one value for everything: controls 6 px; panels and
  table containers 10 px; sheets, dialogs and the live panel 16 px; pills full.
- Depth comes from tone and 1 px `cinder` lines. Shadows only on layers that float
  above content (sheets, popovers, command palette, the live panel):
  `0 12px 32px -12px rgba(30,36,48,.28)`.

### Spacing and layout

- 4 px base grid. Page padding 24 px; section gaps 32 px; row height 56 px in lists.
- Left-aligned everywhere. Numbers right-aligned in tables.

### Motion

| Token | Value | Use |
|---|---|---|
| `instant` | 120 ms ease-out | hover, press, toggles |
| `ui` | 200 ms ease-out | menus, tabs, filters |
| `sheet` | 320 ms cubic-bezier(.2,.8,.2,1) | sheets, panels, dialogs |
| `spring` | stiffness 400, damping 32 | drag, list reflow, layout changes |

## 4. Motion principles

Motion answers the user or marks something live. It is never decoration.

**Allowed:**
- **Ignite (the signature).** When an answer card arrives in the live panel, a thin
  `glow` line sweeps down its left edge and settles as a solid 3 px edge (600 ms),
  while the text streams in. This is the one moment of drama in the product.
- **Listening indicator.** The only continuous animation: a small `glow` dot that
  breathes slowly while the assistant is listening.
- **Streaming text** for transcripts and AI output.
- **Layout reflow** (spring): handled items collapse out of My Day and the counts
  tick down; deals settle into a new column after a drag.
- **Sheets and dialogs** sliding from their edge; **expand/collapse** for notes and
  history.

**Not allowed:** fade-and-slide-up on page sections, hover lift on every card,
parallax, gradient washes, confetti, skeletons that shimmer for longer than the data
takes to load.

**Reduced motion:** every animation falls back to an instant change or a short
opacity fade. Streaming text still appears progressively but without the ignite sweep.

## 5. Layout concepts

### App shell

```
┌──────────┬───────────────────────────────────────────────┐
│ Ember    │  Page title                 Search  Bell  Sam  │
│          ├───────────────────────────────────────────────┤
│ My Day   │                                               │
│ Calls    │                 page content                  │
│ Pipeline │                                               │
│ Team     │                                               │
│ Revival  │                                               │
│ Knowledge│                                               │
│ Reports  │                                               │
│ Settings │                                               │
│          │                                               │
│ Demo ▸   │                                               │
└──────────┴───────────────────────────────────────────────┘
```
Rail 232 px, collapsible to 64 px. Top bar 56 px. Navigation shows only what the
current role can use.

### My Day: a working list, not a card grid

```
┌───────────────────────────────┬───────────────────────────┐
│ 4 need you today   2 calls    │ Meridian Robotics          │
├───────────────────────────────┤ Priya Shah, VP Engineering │
│ ● Meridian Robotics   6d over │ Discovery complete         │
│   No next action since the    ├───────────────────────────┤
│   discovery call              │ Why it's here              │
│   Share the ROI case study    │ Suggested next step        │
├───────────────────────────────┤ Discovery notes (expand)   │
│ ● Blue Harbor Logistics 9d    │ Extracted: question,       │
│   …                           │ next action, blocker       │
├───────────────────────────────┤                            │
│ ● Ferro Analytics       2d    │ [View draft] [Handled]     │
│ ● Solvex Manufacturing  3d    │ [Snooze 3 days]            │
└───────────────────────────────┴───────────────────────────┘
```
Rows separated by lines; the selected row opens a detail pane on the right
(master-detail). The heat dot leads each row. Today's calls sit above the list.

### Live call demo

```
┌────────────────────────────────────────┬─────────────────────┐
│                                        │ ● Listening  12:04  │
│        mock Teams call stage           │ Hidden from share ✓ │
│   ┌──────────┐   ┌──────────┐          ├─────────────────────┤
│   │ Tom Reyes│   │  Sam (you)│          │ ▌Integration runs   │
│   └──────────┘   └──────────┘          │ ▌in 3 phases over   │
│                                        │ ▌6–8 weeks; ERP     │
│                                        │ ▌connector first.   │
│                                        │  Source: Integration│
│                                        │  guide v3, §2       │
│                                        │  [Useful] [Wrong]   │
│                                        ├─────────────────────┤
│                                        │ Ask next: Which ERP │
│                                        │ are you on today?   │
│                                        ├─────────────────────┤
│   mic  camera  share  leave            │ Transcript…         │
└────────────────────────────────────────┴─────────────────────┘
```
The panel is 400 px wide, the current card is the hero, earlier cards collapse into
a history stack, and the transcript sits below in smaller text. Client lines are
`coal`; rep lines are `smoke`.

### Pipeline board

Columns per stage with totals in the column header; deals as compact tiles (name,
value, owner initials, heat dot). This is the one place tiles are right, because they
are physically moved.

## 6. Ember components (in `packages/ui`)

- `HeatIndicator`: dot plus optional label (Warm, Cooling, Cold); tooltip with the last
  meaningful activity.
- `ReasonLine`: the plain-language reason an item needs attention.
- `SuggestedAction`: the next step with its primary action.
- `SourceChip`: document title, version and section; opens the passage in a popover.
- `AnswerCard`: streaming answer with ignite edge, source chip, feedback controls.
- `NotConfirmedCard`: `frost` edge, the holding line in quotation marks, note that the
  question was added to follow-ups.
- `ObjectionCard`, `ContradictionAlert`, `NextQuestion`.
- `TranscriptStream`: speaker-separated, auto-scroll with "jump to live" when the user
  scrolls up.
- `ListeningIndicator`, `CallTimer`, `ShareStatus`, `ConsentStatus`.
- `ExtractedField`: label, value, edit-in-place.
- `DraftComposer`: editor, "facts used" chips, regenerate, copy, send.
- `StageBadge`, `StatusPill`, `MetricTile`, `TrendChart`, `EmptyState`, `ErrorState`,
  `DemoBadge`.

## 7. Writing rules

- Sentence case everywhere. No all-caps labels or eyebrows above headings.
- Name things by what users understand: "Team view", not "Leader dashboard
  aggregation".
- Do not join metadata with middle dots ("A · B · C"). Show fields as separate,
  aligned elements (the original prototype did this; don't copy it).
- Buttons say exactly what happens, and the result uses the same verb: "Send" →
  "Sent", "Approve summary" → "Summary approved". No arrows appended to button text.
- Reasons are plain and specific: "Tom asked about the integration timeline on the
  last call. No reply yet."
- Errors say what happened and what to do: "Couldn't load your list. Check your
  connection and try again." They don't apologise.
- Empty states invite action: "Nothing needs you right now. New items appear after
  tomorrow's 7:00 check."
- AI output is labelled by what it is ("Suggested reply", "Draft summary"), never with
  sparkle icons or "AI magic".

## 8. Quality floor

- WCAG 2.2 AA contrast; visible focus ring (2 px `coal` outline with 2 px offset).
- Fully keyboard operable, including the pipeline board (dnd-kit keyboard sensor).
- Light and dark themes, both first-class.
- App screens responsive down to 1280 px wide; the live panel works from 380 px.
- Loading, empty and error states on every screen.
- A small "Demo data" badge in the top bar while in mock mode.

---

## 9. Generation prompt (give this to the agent before building any screen)

> You are the design lead and senior frontend engineer for **Ember**, an AI sales
> copilot. Reps get grounded, plain-language answers live on Microsoft Teams calls,
> post-call summaries and follow-up drafts, and a daily "My Day" list of
> opportunities that need attention. Team leads see stalled and unassigned deals.
> Admins manage the knowledge base the answers come from.
>
> Build every screen to `docs/ui-design-prompt.md` and the architecture in
> `docs/frontend-plan.md`. The design must feel calm, fast, confident and
> trustworthy, like a tool a rep can glance at mid-call without losing the thread.
>
> **Visual system.** The concept is deal temperature: warm means active, cooling means
> needs attention, cold means stalled. Use the tokens exactly: neutral `ash`, `paper`,
> `coal`, `smoke` and `cinder` for almost everything; `glow` only for warmth and live AI
> arrival; `frost` for cooling and "Not confirmed"; `moss` for done; `flare` only for
> errors and overdue badges. One typeface, Schibsted Grotesk, with tabular numbers.
> Radii follow hierarchy (6, 10, 16 px). Depth from tone and 1 px lines; shadows only on
> floating layers.
>
> **Layout.** Lists are working lists with rows and a detail pane, not grids of identical
> rounded cards. Tiles appear only on the pipeline board. Left-aligned, dense but
> breathable, 56 px rows.
>
> **Motion.** Spend boldness in one place: the ignite animation when an answer card
> arrives in the live panel. Otherwise motion only answers user actions (sheets, expand,
> list reflow with springs, drag) or shows something live (streaming text, the breathing
> listening dot). No entrance animations on page sections, no hover lift on everything,
> no gradients, no confetti. Respect reduced motion.
>
> **Writing.** Sentence case, plain verbs, no all-caps eyebrows, no middle-dot metadata
> strings, no arrows on buttons. Actions keep their name through the flow (Send → Sent).
> Errors are direct and say how to fix the problem; empty states invite action.
>
> **Data.** Use only hooks from `@ember/api`; never import mock data in components. Use
> the seeded demo world from the frontend plan so every screen tells the same story.
> Show realistic latency, loading skeletons and a "Not confirmed" case. Never make the
> product look more capable than it will be.
>
> **Quality.** WCAG AA, keyboard operable, visible focus, light and dark themes, loading,
> empty and error states, responsive to 1280 px (live panel to 380 px).
>
> **Process for every screen.** (1) Write a short plan: layout as an ASCII wireframe,
> components used, states, motion. (2) Check the plan against this prompt and remove
> anything that looks like a generic template choice. (3) Build it. (4) Take screenshots
> in both themes, critique them against this file, fix what doesn't match, and remove one
> unnecessary element before you finish.

---

## 10. Design review notes (why these choices)

- Rejected a warm cream background with a terracotta accent and serif headings: it is
  the most common generated look and would blur into every other AI product.
- Rejected a dark theme with one neon accent: tiring for an all-day tool and generic.
- Chose deal temperature because it comes from the product's own job and name, and it
  makes colour carry meaning (attention state) rather than decoration.
- Chose master-detail lists over card grids: reps scan dozens of items; rows scan faster
  and avoid the generic card-kit look.
- Put the single dramatic moment in the live answer card because that is the product's
  promise, and the moment the client will remember from the demo.
