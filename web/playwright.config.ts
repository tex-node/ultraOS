import { defineConfig, devices } from "@playwright/test";

// Offline scoring E2E (P13). Tests run against a PRODUCTION build, not `next dev` — the service
// worker is gated to production (see src/app/components/service-worker-registrar.tsx), and
// caching dev/HMR responses produces stale-chunk bugs. `webServer` therefore runs `next build &&
// next start`, on a dedicated port, and reuses it only within a single run.
// Two ways to run (streak v21, Prompt 2):
//   * E2E_BASE_URL set  -> test an ALREADY RUNNING deployment (staging, production); no build, no local server. This is
//     how the launch-readiness runs work, because the point is to test the thing that is deployed.
//   * E2E_BASE_URL unset -> the original behaviour: build and start a local production server on E2E_PORT.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL?.replace(/\/$/, "") ?? null;
const BASE_URL = EXTERNAL_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // iPad Safari engine is the primary scorekeeper device; run it too.
    { name: "webkit-ipad", use: { ...devices["iPad (gen 7)"] } },
  ],
  // No local server when a deployment is named: starting a second Next on staging would test the wrong process.
  webServer: EXTERNAL_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
