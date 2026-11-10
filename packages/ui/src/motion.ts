// Motion presets (docs/ui-design-prompt.md section 3). CSS uses the same values in styles/motion.css.

export const duration = { instant: 0.12, ui: 0.2, sheet: 0.32, ignite: 0.6 } as const;

export const easing = {
  out: "easeOut",
  sheet: [0.2, 0.8, 0.2, 1],
} as const;

/** For drag, list reflow and layout changes. */
export const spring = { type: "spring", stiffness: 400, damping: 32 } as const;

/** Layout reflow when something leaves a list: handled items collapse and the rest settle. */
export const reflow = { layout: true, transition: spring } as const;
