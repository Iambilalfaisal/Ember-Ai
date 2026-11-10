import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://localhost:${port}`;
// Use a browser that is already installed (for example in a container) instead of Playwright's own.
const executablePath = process.env["EMBER_E2E_CHROMIUM_PATH"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    // CI builds first (see .github/workflows/frontend.yml) and serves the build.
    command: process.env["CI"] ? "pnpm start" : "pnpm dev",
    url: baseURL,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
