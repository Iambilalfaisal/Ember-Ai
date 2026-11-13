import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { COLOR_NAMES, colors, type Theme } from "./tokens";

const css = readFileSync(path.join(import.meta.dirname, "styles/tokens.css"), "utf8");
const themes: Theme[] = ["light", "dark"];

describe("tokens.css", () => {
  it.each(themes)("has every %s colour from tokens.ts", (theme) => {
    // The dark block is the one with data-theme="dark"; the light values sit in :root.
    const block =
      theme === "dark"
        ? css.slice(css.indexOf(':root[data-theme="dark"]'))
        : css.slice(0, css.indexOf("@media"));
    for (const name of COLOR_NAMES) {
      const value = colors[theme][name];
      expect(block.toLowerCase(), `--ember-${name} in ${theme}`).toContain(
        `--ember-${name}: ${value.toLowerCase()}`,
      );
    }
  });
});

describe("contrast (WCAG 2.2 AA)", () => {
  // Two pairs in the specified palette fall short, so components avoid them (see ADR 0012):
  // flare text on ash is 4.2:1 (error text only appears on paper), and a glow dot on white is 2.2:1
  // (the warm dot carries a glow-ink outline, tested below).
  // Text needs 4.5:1. Dots, edges and the focus ring are non-text and need 3:1.
  type Name = (typeof COLOR_NAMES)[number];
  const text: [string, Name, Name][] = [
    ["primary text on surface", "coal", "paper"],
    ["primary text on background", "coal", "ash"],
    ["secondary text on surface", "smoke", "paper"],
    ["secondary text on background", "smoke", "ash"],
    ["warm text on surface", "glow-ink", "paper"],
    ["warm text on background", "glow-ink", "ash"],
    ["error text on surface", "flare", "paper"],
    ["accent text on surface", "iris-ink", "paper"],
    ["accent text on background", "iris-ink", "ash"],
    ["accent text on soft wash", "iris-ink", "iris-wash"],
    ["primary text on soft wash", "coal", "iris-wash"],
    ["text on accent fill", "iris-fg", "iris"],
    ["rail text", "nav-ink", "nav"],
    ["rail secondary text", "nav-muted", "nav"],
    ["rail accent text", "nav-accent", "nav"],
  ];
  const nonText: [string, Name, Name][] = [
    ["warm dot outline on surface", "glow-ink", "paper"],
    ["cooling dot on surface", "frost", "paper"],
    ["done icon on surface", "moss", "paper"],
    ["error icon on surface", "flare", "paper"],
    ["focus ring on background", "iris", "ash"],
    ["focus ring on surface", "iris", "paper"],
    ["accent fill on surface", "iris", "paper"],
    ["rail focus ring", "nav-accent", "nav"],
  ];

  for (const theme of themes) {
    it.each(text)(`${theme}: %s is at least 4.5:1`, (_label, fg, bg) => {
      expect(contrastRatio(colors[theme][fg], colors[theme][bg])).toBeGreaterThanOrEqual(4.5);
    });
    it.each(nonText)(`${theme}: %s is at least 3:1`, (_label, fg, bg) => {
      expect(contrastRatio(colors[theme][fg], colors[theme][bg])).toBeGreaterThanOrEqual(3);
    });
  }
});
