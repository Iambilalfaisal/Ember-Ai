import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Reports and settings: the last step of the demo path, and the admin's settings.

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

test("the team lead reads the pilot trends", async ({ page }) => {
  await signInAs(page, "Priya");
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("region", { name: "Latest week" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overdue follow-ups by rep" })).toBeVisible();
  await scanBothThemes(page, "reports");

  // Hover reads out a week.
  const chart = page.locator("figure").filter({ hasText: "Answers used" }).first();
  const box = await chart.locator("svg").boundingBox();
  if (!box) throw new Error("Chart is not laid out");
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await expect(chart.getByRole("status")).toContainText("Week of");
  await page.screenshot({ path: "test-results/reports-hover.png", fullPage: true });

  await page.getByRole("radio", { name: "Table" }).click();
  await expect(page.getByRole("table", { name: "Pilot metrics by week" })).toBeVisible();
  await scanBothThemes(page, "reports-table");
});

test("the admin changes a follow-up rule and visits every settings section", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "Alex");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Follow-up rules", level: 2 })).toBeVisible();
  await scanBothThemes(page, "settings-rules");

  const proposal = page.getByLabel("Proposal");
  await proposal.fill("10");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Follow-up rules saved.")).toBeVisible();

  for (const [name, heading] of [
    ["Consent and retention", "Call consent"],
    ["Integrations", "Microsoft Teams"],
    ["Users and roles", "Alex Morgan"],
    ["AI usage and cost", "Per answer"],
  ] as const) {
    await page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("link", { name })
      .click();
    await expect(page.getByText(heading).first()).toBeVisible();
    await scanBothThemes(page, `settings-${name.toLowerCase().replaceAll(" ", "-")}`);
  }
});
