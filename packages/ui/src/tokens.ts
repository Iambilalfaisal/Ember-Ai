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
  "iris",
  "iris-fg",
  "iris-ink",
  "iris-wash",
  "nav",
  "nav-ink",
  "nav-muted",
  "nav-accent",
  "nav-hover",
  "nav-active",
] as const;

export type ColorName = (typeof COLOR_NAMES)[number];
export type Theme = "light" | "dark";

export const colors: Record<Theme, Record<ColorName, string>> = {
  light: {
    ash: "#F4F4FB",
    paper: "#FFFFFF",
    coal: "#15172E",
    smoke: "#555A7A",
    cinder: "#E0E2F0",
    glow: "#E9A23B",
    "glow-ink": "#8F560C",
    frost: "#5F7FCB",
    moss: "#2E8F68",
    flare: "#C93A52",
    iris: "#5B3FD9",
    "iris-fg": "#FFFFFF",
    "iris-ink": "#4F35C4",
    "iris-wash": "#EEEBFE",
    nav: "#14122F",
    "nav-ink": "#EDECFF",
    "nav-muted": "#A7A5D4",
    "nav-accent": "#B3A7FF",
    "nav-hover": "#FFFFFF14",
    "nav-active": "#8B7BFF33",
  },
  dark: {
    ash: "#0D0E1F",
    paper: "#16172F",
    coal: "#ECEBFF",
    smoke: "#A5A8CB",
    cinder: "#2A2C52",
    glow: "#F0AE4A",
    "glow-ink": "#F6C47A",
    frost: "#8FA9E6",
    moss: "#4FBF93",
    flare: "#EF6B80",
    iris: "#9585FF",
    "iris-fg": "#0D0E1F",
    "iris-ink": "#B4A9FF",
    "iris-wash": "#25235A",
    nav: "#0F0E26",
    "nav-ink": "#EDECFF",
    "nav-muted": "#A7A5D4",
    "nav-accent": "#B3A7FF",
    "nav-hover": "#FFFFFF14",
    "nav-active": "#8B7BFF33",
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
  iris: "Brand accent: primary actions, selection, focus, charts",
  "iris-fg": "Text and icons on an iris fill",
  "iris-ink": "Accent text and links on surfaces",
  "iris-wash": "Soft accent tint behind selected or highlighted content",
  nav: "Navigation rail background",
  "nav-ink": "Text on the navigation rail",
  "nav-muted": "Secondary text on the navigation rail",
  "nav-accent": "Active marker and accents on the navigation rail",
  "nav-hover": "Hover wash on the navigation rail",
  "nav-active": "Active item wash on the navigation rail",
};

export const radii = { control: 8, panel: 14, sheet: 20 } as const;

export const typeScale = [12, 13, 14, 16, 18, 20, 24, 32] as const;

export const spacing = { base: 4, page: 24, section: 32, row: 56 } as const;
