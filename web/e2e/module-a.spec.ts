import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Module A: My Day, the draft sheet, Team view and the Revival queue, along the demo path.

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
  // Colours ease between themes; scan once they have settled.
  await page.waitForTimeout(500);
}

test("the demo path: open Meridian, read the notes, send the draft, the item leaves", async ({
  page,
}) => {
  await signInAs(page, "Sam Okafor");
  const list = page.getByRole("list", { name: "Opportunities that need you" });
  await expect(list.getByRole("button")).toHaveCount(4);
  await expect(page.getByText("4 need you today")).toBeVisible();

  await list.getByRole("button", { name: /Meridian/ }).click();
  await page.getByRole("button", { name: "Discovery notes" }).click();
  await expect(page.getByText("Original notes")).toBeVisible();
  await expect(page.getByText("Open question", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "View draft" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Facts used")).toBeVisible();
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Sent" })).toBeDisabled();
  await sheet.getByRole("button", { name: "Close" }).click();

  await expect(page.getByText("3 need you today")).toBeVisible();
  await expect(list.getByRole("button", { name: /Meridian/ })).toHaveCount(0);
});

test("a lead assigns an unassigned opportunity and the rep sees it", async ({ page }) => {
  await signInAs(page, "Priya Nair");
  await expect(page).toHaveURL(/\/team$/);
  const row = page.getByRole("row", { name: /Nimbus Freight/ });
  await row.getByRole("combobox").selectOption({ label: "Jules Park" });
  await expect(page.getByText("Nimbus Freight assigned to Jules Park.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Nimbus Freight/ }).getByRole("combobox")).toHaveValue(
    "jules",
  );
});

test("the Revival queue shows a way back in and counts who was left out", async ({ page }) => {
  await signInAs(page, "Priya Nair");
  await page.goto("/revival");
  await expect(page.getByRole("heading", { name: "Coastal Parcel Systems" })).toBeVisible();
  await expect(page.getByText("A way back in")).toHaveCount(3);
  await expect(page.getByText(/1 opportunity left out/)).toBeVisible();
  await expect(page.getByText(/Fernbridge/)).toHaveCount(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`Module A screens have no accessibility violations in ${theme}`, async ({ page }) => {
    await signInAs(page, "Sam Okafor");
    await expect(page.getByText("4 need you today")).toBeVisible();
    await setTheme(page, theme);
    await page.getByRole("button", { name: "Discovery notes" }).click();
    await expect(page.getByText("Original notes")).toBeVisible();
    await scan(page);
    await page.screenshot({ path: `test-results/my-day-${theme}.png`, fullPage: true });

    await page.getByRole("button", { name: "View draft" }).click();
    await expect(page.getByRole("dialog").getByText("Facts used")).toBeVisible();
    await page.waitForTimeout(500);
    await scan(page);
    await page.screenshot({ path: `test-results/draft-${theme}.png` });

    await page.goto("/sign-in");
    await page.getByRole("button", { name: /Priya Nair/ }).click();
    await expect(page.getByRole("row", { name: /Nimbus Freight/ })).toBeVisible();
    await setTheme(page, theme);
    await scan(page);
    await page.screenshot({ path: `test-results/team-${theme}.png`, fullPage: true });

    await page.goto("/revival");
    await expect(page.getByText("A way back in").first()).toBeVisible();
    await setTheme(page, theme);
    await scan(page);
    await page.screenshot({ path: `test-results/revival-${theme}.png`, fullPage: true });
  });
}
