import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The copilot module: the hub, the approval flow and both guided paths, in both themes.

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`copilot in ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("the hub, approving a suggestion and the activity log pass the accessibility scan", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await signInAs(page, "Sam Okafor");
      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Copilot", exact: true })
        .click();
      await expect(page).toHaveURL(/\/copilot$/);
      await expect(page.getByText("Ember suggests")).toBeVisible();
      await axeClean(page);

      await page.getByRole("button", { name: "Approve" }).first().click();
      await page.getByRole("link", { name: "See everything" }).click();
      await expect(page).toHaveURL(/\/copilot\/activity$/);
      await expect(page.getByRole("heading", { name: /activity/i }).first()).toBeVisible();
      await axeClean(page);
    });
  });
}

test("the morning path walks from the digest to the follow-up", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "Sam Okafor");
  await page.getByRole("button", { name: "Demo controls" }).click();
  await page.getByRole("button", { name: "Copilot path: morning to follow-up" }).click();
  const tour = page.getByRole("complementary", { name: "Guided tour" });
  await expect(tour).toContainText("Step 1 of 8");
  for (let i = 0; i < 7; i++) await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Step 8 of 8");
  await axeClean(page);
});

test("the rescue path walks through a stalled deal", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "Sam Okafor");
  await page.getByRole("button", { name: "Demo controls" }).click();
  await page.getByRole("button", { name: "Copilot path: stalled-deal rescue" }).click();
  const tour = page.getByRole("complementary", { name: "Guided tour" });
  await expect(tour).toContainText("Step 1 of 6");
  for (let i = 0; i < 5; i++) await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Step 6 of 6");
  await axeClean(page);
});
