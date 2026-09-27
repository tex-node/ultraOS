import { test, expect } from "@playwright/test";

// A2 smoke test: the production build serves the service worker, the PWA manifest, and the
// offline fallback. The real offline-scoring flow (airplane mode -> score -> reconnect -> drain)
// lands in A3/A4 once POST /api/sync/outbox exists.
test.describe("offline shell (A2)", () => {
  test("serves the service worker with the scoring cache strategies", async ({ request }) => {
    const res = await request.get("/serwist/sw.js");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("offline-api-reads");
    expect(body).toContain("offline-static-assets");
  });

  test("serves the PWA manifest as standalone", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toContain("Ultra League OS");
  });

  test("serves the offline fallback page", async ({ request }) => {
    const res = await request.get("/~offline");
    expect(res.status()).toBe(200);
  });

  test("registers the service worker on a production page load", async ({ page }) => {
    await page.goto("/");
    const hasController = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration("/");
      return Boolean(registration);
    });
    expect(hasController).toBe(true);
  });
});
