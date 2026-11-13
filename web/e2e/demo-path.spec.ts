import { expect, test, type Page } from "@playwright/test";

// The whole demo path (docs/frontend-plan.md section 8) in one run, in the order a client sees it.
// It starts with "Reset demo" and moves between screens by link, because a page reload resets the
// in-page demo data. Run it twice in a row: every run must start from the same world.

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

async function resetDemo(page: Page) {
  await page.getByRole("button", { name: "Demo controls" }).click();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo reset to its starting point.")).toBeVisible();
  await page.keyboard.press("Escape");
}

async function viewAs(page: Page, current: string, next: string) {
  await page.getByRole("button", { name: `Account menu for ${current}` }).click();
  await page.getByRole("button", { name: new RegExp(next) }).click();
}

const nav = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });

async function walkTheDemoPath(page: Page, firstRun: boolean) {
  // 1. Sign in as Sam. My Day shows four opportunities.
  if (firstRun) await signInAs(page, "Sam Okafor");
  else await viewAs(page, "Alex Morgan", "Sam Okafor");
  await resetDemo(page);
  const list = page.getByRole("list", { name: "Opportunities that need you" });
  await expect(page.getByText("4 need you today")).toBeVisible();
  await expect(list.getByRole("button")).toHaveCount(4);

  // 2. Meridian: notes, then edit nothing and send the draft. The item leaves the list.
  await list.getByRole("button", { name: /Meridian/ }).click();
  await page.getByRole("button", { name: "Discovery notes" }).click();
  await expect(page.getByText("Original notes")).toBeVisible();
  await page.getByRole("button", { name: "View draft" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Sent" })).toBeDisabled();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("3 need you today")).toBeVisible();

  // 3. Today's Blue Harbor call: the brief, then start the call.
  await page.getByRole("link", { name: "Open the brief for Blue Harbor Logistics" }).click();
  await expect(page.getByText("Where things stand")).toBeVisible();
  await page.getByRole("link", { name: "Start call" }).click();

  // 4. The live call, at double speed.
  await page.getByRole("radio", { name: "2×" }).click();
  const panel = page.getByRole("complementary", { name: "Call assistant" });
  const card = panel.getByRole("region", { name: "Current card" });
  await expect(card).toContainText("Integration runs in three phases", { timeout: 20_000 });
  await expect(panel.getByText("Integration guide v3, section 2")).toBeVisible();
  await expect(card).toContainText("Not confirmed", { timeout: 25_000 });
  await expect(card).toContainText("Your price is higher than the other vendor.", {
    timeout: 25_000,
  });
  await expect(card).toContainText("This differs from what was said earlier", {
    timeout: 25_000,
  });
  await expect(panel.getByText("Which ERP version are you on today?")).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText("The script has finished.")).toBeVisible({ timeout: 25_000 });

  // 5. End the call, approve the summary. Tasks appear and the follow-up draft is ready.
  await page.getByRole("button", { name: "End call" }).click();
  await expect(page).toHaveURL(/\/review$/);
  await page.getByRole("button", { name: "Approve summary" }).click();
  await page
    .getByRole("dialog", { name: /Approve this summary/ })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(page.getByText(/3 tasks added, and the opportunity is updated/)).toBeVisible();
  await page.getByRole("button", { name: "View follow-up draft" }).click();
  await expect(page.getByRole("dialog").getByText("Facts used")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  // 6. Priya: Blue Harbor is back on track; assign Nimbus Freight to Jules.
  await viewAs(page, "Sam Okafor", "Priya Nair");
  await expect(page).toHaveURL(/\/team$/);
  await expect(
    page.getByRole("row", { name: /Blue Harbor/ }).getByText("On track", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("row", { name: /Nimbus Freight/ })
    .getByRole("combobox")
    .selectOption({ label: "Jules Park" });
  await expect(page.getByText("Nimbus Freight assigned to Jules Park.")).toBeVisible();

  // 7. Revival queue: a way back in; Fernbridge is left out.
  await nav(page, "Revival queue").click();
  await expect(page.getByRole("heading", { name: "Coastal Parcel Systems" })).toBeVisible();
  await expect(page.getByText(/1 opportunity left out/)).toBeVisible();
  await expect(page.getByText(/Fernbridge/)).toHaveCount(0);

  // 8. Pipeline: drag Blue Harbor to Proposal; its timeline shows today's call.
  await nav(page, "Pipeline").click();
  const proposal = page.getByRole("region", { name: "Proposal" });
  const grip = page.getByRole("button", { name: "Move Blue Harbor Logistics" });
  await expect(grip).toBeVisible();
  const from = await grip.boundingBox();
  const to = await proposal.boundingBox();
  if (!from || !to) throw new Error("The board is not laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 20 });
  await page.mouse.up();
  await expect(proposal.getByRole("link", { name: "Blue Harbor Logistics" })).toBeVisible();
  await proposal.getByRole("link", { name: "Blue Harbor Logistics" }).click();
  const activity = page.getByRole("list", { name: "Activity" });
  await expect(activity.getByText("Moved to Proposal")).toBeVisible();
  await expect(activity.getByText(/Integration and next steps|Call/).first()).toBeVisible();

  // 9. Alex: deactivate an outdated document and ask the test console a question.
  await viewAs(page, "Priya Nair", "Alex Morgan");
  await nav(page, "Knowledge base").click();
  await page.getByRole("button", { name: "Deactivate Pricing guide v4" }).click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Pricing guide" })
      .filter({ hasText: "v4" })
      .getByText("Inactive"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Test console", exact: true }).click();
  await page.getByLabel("Ask a question").fill("How long does integration take?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("article", { name: "Answer" })).toContainText("three phases", {
    timeout: 10_000,
  });

  // 10. Reports: the pilot trends.
  await nav(page, "Reports").click();
  await expect(page.getByRole("region", { name: "Latest week" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overdue follow-ups by rep" })).toBeVisible();
}

test("the full demo path, twice in a row from Reset demo", async ({ page }) => {
  test.setTimeout(420_000);
  await walkTheDemoPath(page, true);
  // The second walk begins where the first one ended (as Alex, on Reports) and uses only Reset demo.
  await walkTheDemoPath(page, false);
});
