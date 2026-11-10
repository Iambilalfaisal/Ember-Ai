import { expect, test } from "@playwright/test";

test("the shell loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Ember");
  await expect(page.getByRole("heading", { level: 1, name: "Ember" })).toBeAttached();
});
