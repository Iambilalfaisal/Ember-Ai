import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Module B: the Blue Harbor call from brief to approved summary, at 2x so it finishes quickly.

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

async function scanBothThemes(page: Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await scan(page);
    await page.screenshot({ path: `test-results/${name}-${theme}.png`, fullPage: true });
  }
  await setTheme(page, "light");
}

test("the Blue Harbor call, from the brief to an approved summary", async ({ page }) => {
  test.setTimeout(180_000);
  await signInAs(page, "Sam Okafor");
  await expect(page.getByText("4 need you today")).toBeVisible();

  // The brief.
  await page.getByRole("link", { name: "Open the brief for Blue Harbor Logistics" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Call brief" })).toBeVisible();
  await expect(page.getByText("Where things stand")).toBeVisible();
  await scanBothThemes(page, "brief");
  await page.getByRole("link", { name: "Start call" }).click();

  // The live call.
  await expect(page.getByRole("heading", { level: 1, name: "Live call" })).toBeVisible();
  await page.getByRole("radio", { name: "2×" }).click();
  const panel = page.getByRole("complementary", { name: "Call assistant" });
  await expect(panel.getByText("Listening", { exact: true })).toBeVisible();
  await expect(panel.getByText("Hidden from screen share")).toBeVisible();
  await expect(panel.getByRole("region", { name: "Current card" })).toContainText(
    "Integration runs in three phases",
    { timeout: 15_000 },
  );
  await expect(panel.getByText("Integration guide v3, section 2")).toBeVisible();
  await expect(panel.getByRole("region", { name: "Current card" })).toContainText("Not confirmed", {
    timeout: 20_000,
  });
  await expect(panel.getByRole("region", { name: "Current card" })).toContainText(
    "Your price is higher than the other vendor.",
    { timeout: 20_000 },
  );
  await expect(panel.getByRole("region", { name: "Current card" })).toContainText(
    "This differs from what was said earlier",
    { timeout: 20_000 },
  );
  await expect(panel.getByText("Which ERP version are you on today?")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("The script has finished.")).toBeVisible({ timeout: 20_000 });

  // The rep rates the first answer from the history.
  await panel.getByRole("button", { name: /^Answer/ }).click();
  await panel.getByRole("button", { name: "Useful" }).click();
  await expect(panel.getByText("Marked useful")).toBeVisible();
  await scanBothThemes(page, "live");

  // Review and approve.
  await page.getByRole("button", { name: "End call" }).click();
  await expect(page).toHaveURL(/\/calls\/call-blue-harbor-live\/review$/);
  await expect(page.getByRole("heading", { level: 2, name: "Draft summary" })).toBeVisible();
  await expect(page.getByText("Blue Harbor now has six sites in scope.")).toBeVisible();
  await scanBothThemes(page, "review");

  await page.getByRole("button", { name: "Approve summary" }).click();
  const dialog = page.getByRole("dialog", { name: /Approve this summary/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/3 tasks added, and the opportunity is updated/)).toBeVisible();
  await page.getByRole("button", { name: "View follow-up draft" }).click();
  await expect(page.getByRole("dialog").getByText("Facts used")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  // The ripple: My Day no longer asks about Blue Harbor, and the call is in the library.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /My Day/ })
    .click();
  await expect(page.getByText("3 need you today")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Opportunities that need you" }).getByRole("button", {
      name: /Blue Harbor/,
    }),
  ).toHaveCount(0);
  // The mock data lives in the page, so move by link: a reload would reset the demo.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Calls" }).click();
  await page
    .getByRole("link", { name: /Open call for Blue Harbor Logistics, Integration and next steps/ })
    .click();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Answers" }).click();
  await expect(page.getByText(/marked useful/)).toBeVisible();
});

test("a lead sees Blue Harbor back on track after the call", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "Sam Okafor");
  await page.goto("/live/call-blue-harbor-live");
  await page.getByRole("radio", { name: "2×" }).click();
  await expect(page.getByText("The script has finished.")).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: "End call" }).click();
  await expect(page).toHaveURL(/\/review$/);
  await page.getByRole("button", { name: "Approve summary" }).click();
  await page
    .getByRole("dialog", { name: /Approve this summary/ })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(page.getByText(/tasks added, and the opportunity/)).toBeVisible();

  await page.getByRole("button", { name: "Account menu for Sam Okafor" }).click();
  await page.getByRole("button", { name: /Priya Nair/ }).click();
  await expect(page).toHaveURL(/\/team$/);
  const row = page.getByRole("row", { name: /Blue Harbor/ });
  await expect(row.getByText("On track", { exact: true })).toBeVisible();
});

test("a call with no script says so instead of failing", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.goto("/live/call-solvex-qa");
  await expect(page.getByText("No scripted call for this one")).toBeVisible();
});
