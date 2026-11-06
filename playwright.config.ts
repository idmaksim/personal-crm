import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env so the test process sees DATABASE_URL — the e2e teardown connects to
// the same database to remove the contacts the test created.
loadEnv();

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// End-to-end tests run against the real app and the real Postgres in Docker, no
// mocks. Playwright builds and starts a production server on a dedicated port, so
// the run is self-contained and does not collide with a `pnpm dev` you may have
// open on 3000 (Next.js allows only one dev server per project).
export default defineConfig({
  testDir: "./e2e",
  // One worker: the tests share one database and assert on what they created.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build and serve into a dedicated dist dir so the e2e run never overwrites
    // the ".next" a local `pnpm dev` on :3000 is using (see next.config.mjs).
    command: `NEXT_DIST_DIR=.next-e2e pnpm next build && NEXT_DIST_DIR=.next-e2e pnpm next start --port ${PORT}`,
    url: baseURL,
    // Always use the server Playwright builds and starts, so the run reflects the
    // current source (and so a stale server from a previous run is never reused).
    reuseExistingServer: false,
    // Covers a cold production build plus server start.
    timeout: 240_000,
  },
});
