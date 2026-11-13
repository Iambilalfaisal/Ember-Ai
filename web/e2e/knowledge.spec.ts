import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Knowledge base: the admin step of the demo path.

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => {
    document.documentElement.dataset["theme"] = value;
    document.documentElement.classList.toggle("dark", value === "dark");
  }, theme);
  await page.waitForTimeout(500);
}

async function scanBothThemes(page: Page, name: string) {
  // A toast fading out is half transparent and fails the contrast check; let it finish first.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await scan(page);
    await page.screenshot({ path: `test-results/${name}-${theme}.png`, fullPage: true });
  }
  await setTheme(page, "light");
}

test("the admin turns off an outdated document and asks the test console a question", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, "Alex");
  await page.getByRole("link", { name: "Knowledge base", exact: true }).click();

  await expect(page.getByRole("table", { name: "Documents" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Quality scorecard" })).toContainText("91%");
  await scanBothThemes(page, "knowledge");

  // Deactivate the outdated pricing guide.
  await page.getByRole("button", { name: "Deactivate Pricing guide v4" }).click();
  await scanBothThemes(page, "knowledge-confirm");
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Pricing guide" }).filter({ hasText: "v4" });
  await expect(row.getByText("Inactive")).toBeVisible();

  // Ask a question that a document answers, then one that none does.
  await page.getByRole("link", { name: "Test console", exact: true }).click();
  await page.getByLabel("Ask a question").fill("How long does integration take?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("article", { name: "Answer" })).toContainText("three phases", {
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /Integration guide v3, section 2/ })).toBeVisible();
  await scanBothThemes(page, "test-console-answer");

  await page.getByRole("button", { name: "Do you have SOC 2 certification?" }).click();
  await expect(page.getByRole("article", { name: "Not confirmed" })).toBeVisible();
  await scanBothThemes(page, "test-console-not-confirmed");
});

test("a rep can read the knowledge base but not change it", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.getByRole("link", { name: "Knowledge base", exact: true }).click();
  await expect(page.getByRole("table", { name: "Documents" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload document" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Quality scorecard" })).toHaveCount(0);
});
