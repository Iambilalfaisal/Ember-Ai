import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The public landing page at /: the story, the scroll-driven product picture, and its manners.

const sections = [
  /Deals are not lost in the meeting/,
  /One working day/,
  /Everything a sales team needs/,
  /Built so a company can trust it/,
  /See Ember run a real sales call/,
];

/** Scroll the whole page once, so every reveal has played, then come back to the top. */
async function playEverything(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
}

test("the page tells the whole story and the demo button works from the end", async ({ page }) => {
  await page.goto("/");
  for (const name of sections) {
    await page.getByRole("heading", { level: 2, name }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await page.getByRole("link", { name: /Start the live demo/ }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the nav links jump to their sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Page" }).getByRole("link", { name: "Trust" }).click();
  await expect(page).toHaveURL(/#trust$/);
  await expect(
    page.getByRole("heading", { level: 2, name: /Built so a company/ }),
  ).toBeInViewport();
});

test("the product picture follows the story as the reader scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const stage = page.locator(".lp-sticky-scene[data-on='true']");
  await page.getByRole("heading", { level: 3, name: "Start with focus" }).scrollIntoViewIfNeeded();
  await expect(stage).toContainText("My Day");
  await page.getByRole("heading", { level: 3, name: "See risk early" }).scrollIntoViewIfNeeded();
  await expect(stage).toContainText("Team view");
});

test("a step can be chosen with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const second = page.getByRole("button", { name: /Before the call/ });
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".lp-step[data-active='true']")).toContainText("Walk in prepared");
});

for (const [name, width, height] of [
  ["a phone", 390, 844],
  ["a laptop", 1280, 720],
  ["a wide screen", 1920, 1080],
] as const) {
  test(`on ${name} nothing scrolls sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await playEverything(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the whole page at once, with nothing animating", async ({ page }) => {
    await page.goto("/");
    // No scrolling first: every reveal must already be visible.
    await expect(page.getByRole("heading", { level: 2, name: /See Ember run/ })).toHaveCSS(
      "opacity",
      "1",
    );
    const moving = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => Number(a.effect?.getTiming().duration ?? 0) > 50)
          .length,
    );
    expect(moving).toBe(0);
    await expect(page.locator(".lp-words span").first()).toHaveCSS("opacity", "1");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`the landing page has no WCAG 2.2 AA violations (${scheme} system theme)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await playEverything(page);
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(violations).toEqual([]);
  });
}
