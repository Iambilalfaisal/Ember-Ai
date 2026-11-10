import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// docs/ui-design-prompt.md section 7, checked on the source of every component.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(name) && !name.endsWith(".test.tsx") ? [full] : [];
  });
}

const files = sourceFiles(import.meta.dirname).map((file) => ({
  name: path.relative(import.meta.dirname, file),
  text: readFileSync(file, "utf8"),
}));

describe("writing and style rules", () => {
  it("finds the component files", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each(files)("$name: no middle-dot metadata strings", ({ text }) => {
    expect(text).not.toMatch(/ · /);
  });

  it.each(files)("$name: no arrows on buttons or labels", ({ text }) => {
    expect(text).not.toMatch(/[→⟶➜➔▸▶]|&rarr;/);
  });

  it.each(files)("$name: no all-caps labels", ({ text }) => {
    expect(text).not.toMatch(/\buppercase\b/);
  });

  it.each(files)("$name: no gradients or shimmer", ({ text }) => {
    expect(text).not.toMatch(/gradient|shimmer/);
  });

  it.each(files)("$name: no raw hex colours", ({ text }) => {
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
