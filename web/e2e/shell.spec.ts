import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The app shell, sign-in, navigation by role, the command palette and the demo controls.

async function signInAs(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test("the front door sends a signed-out visitor to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page).toHaveTitle("Ember");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sign in as/ })).toHaveCount(4);
});

test("signing in as a rep lands on My Day with the rep's navigation and count", async ({
  page,
}) => {
  await signInAs(page, "Sam Okafor");
  await expect(page).toHaveURL(/\/my-day$/);
  await expect(page.getByRole("heading", { level: 1, name: "My Day" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: /My Day/ })).toContainText("4");
  await expect(nav(page).getByRole("link", { name: "Team view" })).toHaveCount(0);
  await expect(page.getByText("Demo data")).toBeVisible();
});

test("switching role changes the navigation, the page and the data", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.getByRole("button", { name: "Account menu for Sam Okafor" }).click();
  await page.getByRole("button", { name: /Priya Nair/ }).click();

  await expect(page).toHaveURL(/\/team$/);
  await expect(nav(page).getByRole("link", { name: /Team view/ })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: /Team view/ })).toContainText("5");
  await expect(nav(page).getByRole("link", { name: /My Day/ })).not.toContainText(/\d/);

  await page.getByRole("button", { name: "Account menu for Priya Nair" }).click();
  await page.getByRole("button", { name: /Sam Okafor/ }).click();
  await expect(page).toHaveURL(/\/my-day$/);
  await expect(nav(page).getByRole("link", { name: "Team view" })).toHaveCount(0);
});

test("a rep who opens Team view directly is sent home and told why", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.goto("/team");
  await expect(page).toHaveURL(/\/my-day$/);
  await expect(page.getByText("Team view isn't available for your role.")).toBeVisible();
});

test("every route is reachable from the navigation or the command palette", async ({ page }) => {
  await signInAs(page, "Alex Morgan");

  // The rail.
  for (const label of [
    "Calls",
    "Tasks",
    "Pipeline",
    "Contacts",
    "Team view",
    "Revival queue",
    "Knowledge base",
    "Reports",
    "Settings",
    "My Day",
  ]) {
    await nav(page)
      .getByRole("link", { name: new RegExp(label) })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      label === "Settings" ? "Follow-up rules" : label,
    );
  }

  // The rest, through the palette.
  const palette = async (query: string, option: RegExp) => {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox").fill(query);
    await page.getByRole("option", { name: option }).first().click();
  };
  await palette("test console", /^Test console/);
  await expect(page).toHaveURL(/\/knowledge\/test$/);
  await palette("integrations", /^Integrations/);
  await expect(page).toHaveURL(/\/settings\/integrations$/);
  await palette("meridian", /Meridian Robotics/);
  await expect(page).toHaveURL(/\/deals\/meridian$/);
  await expect(page.getByRole("heading", { level: 1, name: "Opportunity" })).toBeVisible();
  await palette("live call", /Play the live call scenario/);
  await expect(page).toHaveURL(/\/live\/call-blue-harbor-live$/);
  await expect(page.getByRole("heading", { level: 1, name: "Live call" })).toBeVisible();

  // Pages with an id in the address.
  for (const [path, heading] of [
    ["/calls/call-blue-harbor-live", "Call"],
    ["/calls/call-blue-harbor-live/prep", "Call brief"],
    ["/calls/call-blue-harbor-live/review", "Review summary"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("the command palette opens with Ctrl+K, filters, and closes with Escape", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await expect(page.getByRole("heading", { level: 1, name: "My Day" })).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search or jump to" });
  await expect(dialog).toBeVisible();
  await page.getByRole("combobox").fill("pipe");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/pipeline$/);
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("notifications can be marked as read", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.getByRole("button", { name: "Notifications, 3 unread" }).click();
  await expect(page.getByText("4 opportunities need you")).toBeVisible();
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
});

test("the demo controls reset the demo and the sign-in survives a reload", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.getByRole("button", { name: "Demo controls" }).click();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo reset to its starting point.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "My Day" })).toBeVisible();
});

test("the theme choice is kept and applied before the page paints", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.getByRole("button", { name: "Account menu for Sam Okafor" }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("collapsing the navigation keeps every item reachable by name", async ({ page }) => {
  await signInAs(page, "Sam Okafor");
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(nav(page).getByRole("link", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`sign-in and the shell have no WCAG 2.2 AA violations in the ${scheme} theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const scan = async () =>
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: /Sam Okafor/ })).toBeVisible();
    expect(await scan()).toEqual([]);

    await page.getByRole("button", { name: /Sam Okafor/ }).click();
    await expect(nav(page).getByRole("link", { name: /My Day/ })).toContainText("4");
    expect(await scan()).toEqual([]);

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Search or jump to" })).toBeVisible();
    // Let the dialog finish opening. A scan mid-fade measures blended colours.
    await page.waitForTimeout(500);
    expect(await scan()).toEqual([]);
  });
}
