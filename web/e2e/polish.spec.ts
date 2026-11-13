import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// FE9: layout at the supported widths, the live panel at its narrowest, and reduced motion.

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

/** True when nothing on the page scrolls sideways. */
async function fitsWidth(page: Page) {
  return page.evaluate(() => {
    const main = document.getElementById("main");
    return {
      page: document.documentElement.scrollWidth <= window.innerWidth,
      main: main ? main.scrollWidth <= main.clientWidth : true,
    };
  });
}

test.describe("app screens at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const person of ["Sam Okafor", "Priya Nair", "Alex Morgan"]) {
    test(`every screen ${person} can open fits without sideways scrolling`, async ({ page }) => {
      test.setTimeout(120_000);
      await signInAs(page, person);
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link").nth(3)).toBeVisible();
      const names = await nav.getByRole("link").allInnerTexts();
      expect(names.length).toBeGreaterThanOrEqual(6);
      for (const raw of names) {
        // "My Day 4" carries its count in the link text.
        const name = raw.replace(/\s*\d+\s*$/, "").trim();
        await nav
          .getByRole("link", { name: new RegExp(`^${name}`) })
          .first()
          .click();
        await page.waitForTimeout(400);
        expect(await fitsWidth(page), `${person}: ${name}`).toEqual({ page: true, main: true });
      }
    });
  }

  test("deal detail, the test console and every settings section fit too", async ({ page }) => {
    await signInAs(page, "Alex Morgan");
    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Pipeline", exact: true }).click();
    await page.getByRole("link", { name: "Solvex Manufacturing" }).click();
    await expect(page.getByRole("heading", { name: "Solvex Manufacturing" })).toBeVisible();
    expect(await fitsWidth(page)).toEqual({ page: true, main: true });

    await nav.getByRole("link", { name: "Knowledge base", exact: true }).click();
    await page.getByRole("link", { name: "Test console", exact: true }).click();
    expect(await fitsWidth(page)).toEqual({ page: true, main: true });

    await nav.getByRole("link", { name: "Settings", exact: true }).click();
    const sections = page.getByRole("navigation", { name: "Settings sections" });
    await expect(sections.getByRole("link")).toHaveCount(5);
    for (const label of await sections.getByRole("link").allInnerTexts()) {
      await sections.getByRole("link", { name: label }).click();
      await page.waitForTimeout(300);
      expect(await fitsWidth(page), label).toEqual({ page: true, main: true });
    }
  });
});

test.describe("the live panel at its narrowest", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("keeps every card inside a 380 px panel for the whole call", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, "Sam Okafor");
    await page.getByRole("link", { name: "Open the brief for Blue Harbor Logistics" }).click();
    await page.getByRole("link", { name: "Start call" }).click();
    await page.getByRole("radio", { name: "2×" }).click();

    const panel = page.getByRole("complementary", { name: "Call assistant" });
    await expect(panel).toBeVisible();
    // Force the narrowest width the panel supports.
    await panel.evaluate((element) => {
      element.style.width = "380px";
      element.style.maxWidth = "380px";
    });
    await expect(page.getByText("The script has finished.")).toBeVisible({ timeout: 40_000 });

    const box = await panel.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(380);
    const overflow = await panel.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const outside = [...element.querySelectorAll("*")].filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && (rect.right > bounds.right + 1 || rect.left < bounds.left - 1);
      });
      return { scroll: element.scrollWidth <= element.clientWidth, outside: outside.length };
    });
    expect(overflow).toEqual({ scroll: true, outside: 0 });

    const results = await new AxeBuilder({ page })
      .include('[aria-label="Call assistant"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await panel.screenshot({ path: "test-results/live-panel-380.png" });
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 720 } });

  test("turns the ignite, the breathing and the sheets into instant changes", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAs(page, "Sam Okafor");
    await page.getByRole("link", { name: "Open the brief for Blue Harbor Logistics" }).click();
    await page.getByRole("link", { name: "Start call" }).click();

    const panel = page.getByRole("complementary", { name: "Call assistant" });
    await expect(panel.getByRole("region", { name: "Current card" })).toContainText(
      "Integration runs in three phases",
      { timeout: 20_000 },
    );
    const animations = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSAnimation)
        .map((animation) => (animation as CSSAnimation).animationName),
    );
    expect(animations).toEqual([]);

    await page.getByRole("button", { name: "Demo controls" }).first().click();
    // Anything still moving for longer than a blink is a real animation, not an instant change.
    const slow = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => Number(animation.effect?.getTiming().duration ?? 0) > 50).length,
    );
    expect(slow).toBe(0);
  });

  test("a deal can still be moved between stages", async ({ page }) => {
    await signInAs(page, "Sam Okafor");
    await page.getByRole("link", { name: "Pipeline", exact: true }).click();
    await page.getByRole("button", { name: "Move Meridian Robotics" }).focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await page.keyboard.press("Space");
    await expect(
      page
        .getByRole("region", { name: "Qualified" })
        .getByRole("link", { name: "Meridian Robotics" }),
    ).toBeVisible();
  });
});

test("the guided tour opens from the demo controls and moves the demo along", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.getByRole("button", { name: "Demo controls" }).click();
  await page.getByRole("button", { name: "Start the guided tour" }).click();

  const tour = page.getByRole("complementary", { name: "Guided tour" });
  await expect(tour).toContainText("Step 1 of 8");
  await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/calls\/call-blue-harbor-live\/prep$/);
  await expect(page.getByText("Where things stand")).toBeVisible();

  // Jump to the team lead's part: the tour switches the person for you.
  for (let i = 0; i < 3; i++) await tour.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByRole("button", { name: "Account menu for Priya Nair" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: "test-results/tour.png" });

  await tour.getByRole("button", { name: "End tour" }).click();
  await expect(tour).toHaveCount(0);
});
