import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// /design shows every token and component, so it doubles as the accessibility check for the system.

for (const scheme of ["light", "dark"] as const) {
  test(`has no WCAG 2.2 AA violations in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/design");
    await expect(
      page.getByRole("heading", { level: 1, name: "Ember design system" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      ),
    ).toEqual([]);
  });
}

test("the theme switch changes the tokens", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/design");
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const light = await background();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await background()).not.toBe(light);
});

test("keyboard focus shows a 2 px outline", async ({ page }) => {
  await page.goto("/design");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return { width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset };
  });
  expect(outline).toEqual({ width: "2px", style: "solid", offset: "2px" });
});

test("the answer card ignites, and reduced motion turns the sweep off", async ({ page }) => {
  const edgeAnimation = () =>
    page.evaluate(() => {
      const edge = document.querySelector('article[aria-label="Answer"] .ember-ignite-edge');
      return edge ? getComputedStyle(edge).animationName : "missing";
    });

  await page.goto("/design");
  await page.getByRole("button", { name: "Replay arrival" }).click();
  expect(await edgeAnimation()).toBe("ember-ignite");

  await page.getByRole("radio", { name: "Reduced motion" }).click();
  await page.getByRole("button", { name: "Replay arrival" }).click();
  expect(await edgeAnimation()).toBe("none");
});

test("reduced motion from the system setting also turns it off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/design");
  const listening = await page.evaluate(() => {
    const dot = document.querySelector(".ember-breathe");
    return dot ? getComputedStyle(dot).animationName : "missing";
  });
  expect(listening).toBe("none");
});

test("tabs move with the arrow keys", async ({ page }) => {
  await page.goto("/design");
  await page.getByRole("tab", { name: "Summary" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Transcript" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
