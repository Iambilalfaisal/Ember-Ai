import {
  COLOR_NAMES,
  colorUse,
  colors,
  contrastRatio,
  duration,
  radii,
  spacing,
  typeScale,
  type ColorName,
} from "@ember/ui";
import { Section } from "../layout";

function fitness(ratio: number): string {
  if (ratio >= 4.5) return "Text and graphics";
  if (ratio >= 3) return "Graphics only";
  return "Fill only";
}

function ColourRow({ name }: { name: ColorName }) {
  const light = contrastRatio(colors.light[name], colors.light.paper);
  const dark = contrastRatio(colors.dark[name], colors.dark.paper);
  return (
    <tr className="border-t border-cinder align-top">
      <th scope="row" className="py-3 pr-4 text-left font-medium">
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-6 shrink-0 rounded-control border border-cinder"
            style={{ backgroundColor: `var(--ember-${name})` }}
          />
          {name}
        </span>
      </th>
      <td className="py-3 pr-4 text-detail text-smoke">{colors.light[name]}</td>
      <td className="py-3 pr-4 text-detail text-smoke">{colors.dark[name]}</td>
      <td className="py-3 pr-4 text-sm">{colorUse[name]}</td>
      <td className="py-3 text-right text-detail">
        <span className="block">
          {light.toFixed(1)} light, {dark.toFixed(1)} dark
        </span>
        <span className="block text-smoke">{fitness(Math.min(light, dark))}</span>
      </td>
    </tr>
  );
}

export function Foundations() {
  return (
    <>
      <Section id="colour" title="Colour">
        <p className="max-w-[72ch] text-sm text-smoke">
          Neutrals carry almost everything. Glow marks warmth and live AI arrival, frost marks
          cooling and Not confirmed, moss marks done, flare marks errors and overdue. Contrast is
          measured against paper.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-detail text-smoke">
                <th scope="col" className="pb-2 pr-4 text-left font-normal">
                  Token
                </th>
                <th scope="col" className="pb-2 pr-4 text-left font-normal">
                  Light
                </th>
                <th scope="col" className="pb-2 pr-4 text-left font-normal">
                  Dark
                </th>
                <th scope="col" className="pb-2 pr-4 text-left font-normal">
                  Use
                </th>
                <th scope="col" className="pb-2 text-right font-normal">
                  Contrast on paper
                </th>
              </tr>
            </thead>
            <tbody>
              {COLOR_NAMES.map((name) => (
                <ColourRow key={name} name={name} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-[72ch] text-sm text-smoke">
          Glow on white is a fill, not a text or outline colour, so the warm dot carries a glow-ink
          outline. Flare text only appears on paper.
        </p>
      </Section>

      <Section id="type" title="Type">
        <p className="max-w-[72ch] text-sm text-smoke">
          Schibsted Grotesk with tabular numbers. Body is 14 px at line height 1.5. Headings are
          weight 600.
        </p>
        <div className="mt-4">
          {typeScale.map((size) => (
            <div
              key={size}
              className="grid items-baseline gap-2 border-t border-cinder py-3 md:grid-cols-[6rem_minmax(0,1fr)_12rem]"
            >
              <p className="text-detail text-smoke">{size} px</p>
              <p style={{ fontSize: size }} className="truncate font-medium leading-tight">
                Integration runs in three phases
              </p>
              <p className="text-right text-detail tabular-nums text-smoke">12:04 1,284 98%</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="shape" title="Shape and depth">
        <p className="max-w-[72ch] text-sm text-smoke">
          Radii follow hierarchy. Depth comes from tone and 1 px lines. Only layers that float above
          content get a shadow.
        </p>
        <div className="mt-4">
          {(
            [
              ["Controls", radii.control, "Buttons, inputs, chips"],
              ["Panels", radii.panel, "Panels, table containers, answer cards"],
              ["Sheets", radii.sheet, "Sheets, dialogs, the live panel"],
            ] as const
          ).map(([name, radius, use]) => (
            <div
              key={name}
              className="grid items-center gap-2 border-t border-cinder py-3 md:grid-cols-[10rem_8rem_minmax(0,1fr)] md:gap-6"
            >
              <p className="text-sm font-medium">
                {name}, {radius} px
              </p>
              <div
                aria-hidden="true"
                className="h-12 w-24 border border-smoke bg-paper"
                style={{ borderRadius: radius }}
              />
              <p className="text-sm text-smoke">{use}</p>
            </div>
          ))}
          <div className="grid items-center gap-2 border-t border-cinder py-3 md:grid-cols-[10rem_8rem_minmax(0,1fr)] md:gap-6">
            <p className="text-sm font-medium">Floating layers</p>
            <div
              aria-hidden="true"
              className="h-12 w-24 rounded-panel border border-cinder bg-paper shadow-float"
            />
            <p className="text-sm text-smoke">
              Sheets, popovers, the command palette and the live panel. Spacing: {spacing.base} px
              grid, {spacing.page} px page padding, {spacing.row} px list rows.
            </p>
          </div>
        </div>
      </Section>

      <Section id="motion" title="Motion">
        <p className="max-w-[72ch] text-sm text-smoke">
          Motion answers the user or marks something live. The one dramatic moment is the ignite
          edge on an arriving answer, shown under Live call. With reduced motion every animation
          becomes an instant change.
        </p>
        <div className="mt-4">
          {(
            [
              ["instant", `${duration.instant * 1000} ms ease-out`, "Hover, press, toggles"],
              ["ui", `${duration.ui * 1000} ms ease-out`, "Menus, tabs, filters"],
              [
                "sheet",
                `${duration.sheet * 1000} ms, cubic-bezier(.2, .8, .2, 1)`,
                "Sheets, panels, dialogs",
              ],
              ["spring", "Stiffness 400, damping 32", "Drag, list reflow, layout changes"],
            ] as const
          ).map(([name, value, use]) => (
            <div
              key={name}
              className="grid gap-1 border-t border-cinder py-3 md:grid-cols-[10rem_16rem_minmax(0,1fr)] md:gap-6"
            >
              <p className="text-sm font-medium">{name}</p>
              <p className="text-sm text-smoke">{value}</p>
              <p className="text-sm">{use}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
