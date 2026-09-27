import { defineConfig, devices } from "@playwright/test";

// Offline scoring E2E (P13). Tests run against a PRODUCTION build, not `next dev` — the service
// worker is gated to production (see src/app/components/service-worker-registrar.tsx), and
// caching dev/HMR responses produces stale-chunk bugs. `webServer` therefore runs `next build &&
// next start`, on a dedicated port, and reuses it only within a single run.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
