// The colour tokens of docs/ui-design-prompt.md section 3. styles/tokens.css holds the same values
// for the browser; tokens.test.ts checks that the two agree and that the pairs we rely on meet WCAG AA.

export const COLOR_NAMES = [
  "ash",
  "paper",
  "coal",
  "smoke",
  "cinder",
  "glow",
  "glow-ink",
  "frost",
  "moss",
  "flare",
] as const;

export type ColorName = (typeof COLOR_NAMES)[number];
export type Theme = "light" | "dark";

export const colors: Record<Theme, Record<ColorName, string>> = {
  light: {
    ash: "#EEF0F2",
    paper: "#FFFFFF",
    coal: "#1E2430",
    smoke: "#5E6776",
    cinder: "#D8DCE2",
    glow: "#E9A23B",
    "glow-ink": "#8F560C",
    frost: "#6F8FB8",
    moss: "#3E8E6E",
    flare: "#C9443A",
  },
  dark: {
    ash: "#171C25",
    paper: "#1F2531",
    coal: "#E8EAEE",
    smoke: "#A3AAB7",
    cinder: "#2E3542",
    glow: "#F0AE4A",
    "glow-ink": "#F6C47A",
    frost: "#86A3C9",
    moss: "#5FB08E",
    flare: "#E2685F",
  },
};

export const colorUse: Record<ColorName, string> = {
  ash: "App background",
  paper: "Panels, tables, sheets",
  coal: "Primary text",
  smoke: "Secondary text and icons",
  cinder: "Dividers and borders",
  glow: "Warm state, live AI arrival, accent fills",
  "glow-ink": "Text that must read as warm",
  frost: "Cooling state and Not confirmed",
  moss: "Handled, approved, connected",
  flare: "Errors and overdue badges only",
};

export const radii = { control: 6, panel: 10, sheet: 16 } as const;

export const typeScale = [12, 13, 14, 16, 18, 20, 24, 32] as const;

export const spacing = { base: 4, page: 24, section: 32, row: 56 } as const;
