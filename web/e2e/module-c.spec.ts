import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Module C: drag Blue Harbor to Proposal, then read the deal timeline.

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
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await scan(page);
    await page.screenshot({ path: `test-results/${name}-${theme}.png`, fullPage: true });
  }
  await setTheme(page, "light");
}

test("drag Blue Harbor to Proposal and read its timeline", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "Sam Okafor");
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();

  const qualified = page.getByRole("region", { name: "Qualified" });
  const proposal = page.getByRole("region", { name: "Proposal" });
  await expect(qualified.getByRole("link", { name: "Blue Harbor Logistics" })).toBeVisible();
  await scanBothThemes(page, "pipeline");

  // Real pointer drag from the grip into the Proposal column.
  const grip = page.getByRole("button", { name: "Move Blue Harbor Logistics" });
  const from = await grip.boundingBox();
  const to = await proposal.boundingBox();
  if (!from || !to) throw new Error("Board is not laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 20 });
  await page.mouse.up();

  await expect(proposal.getByRole("link", { name: "Blue Harbor Logistics" })).toBeVisible();
  await expect(qualified.getByRole("link", { name: "Blue Harbor Logistics" })).toHaveCount(0);
  await expect(page.getByText("Blue Harbor Logistics moved to Proposal.")).toBeVisible();

  // The deal shows the move on its timeline, next to today's call.
  await proposal.getByRole("link", { name: "Blue Harbor Logistics" }).click();
  await expect(page.getByRole("heading", { name: "Blue Harbor Logistics" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Activity" }).getByText("Moved to Proposal"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open brief" })).toBeVisible();
  await scanBothThemes(page, "deal-detail");

  // List view, contacts and tasks.
  await page.getByRole("link", { name: "Pipeline", exact: true }).click();
  await page.getByRole("radio", { name: "List" }).click();
  await expect(page.getByRole("table", { name: "Opportunities" })).toBeVisible();
  await scanBothThemes(page, "pipeline-list");

  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page.getByRole("table", { name: "Contacts" })).toBeVisible();
  await scanBothThemes(page, "contacts");

  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("list", { name: "Tasks" })).toBeVisible();
  await expect(page.getByText("Overdue").first()).toBeVisible();
  await scanBothThemes(page, "tasks");
});

test("a keyboard user can move a deal between stages", async ({ page }) => {
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
