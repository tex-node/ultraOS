import { expect, test } from "@playwright/test";

// A5 Step 8 / definition of done: a scoring tap taken with the network down must be captured locally, survive the outage,
// and reach the server (and therefore the scoreboard) once the device reconnects.
//
// This is the browser-level version of "put the tablet in airplane mode and score a quarter". Playwright's
// `context.setOffline(true)` does what airplane mode does to a page: `navigator.onLine` becomes false and every request
// fails, which is the state `live-score-capture.tsx` switches on.
//
// TWO PRECONDITIONS, both learned by running it:
//   1. the fixture must be BASKETBALL - the console only renders LiveScoreCapture for basketball
//      (`isBasketball && game && status !== "FINAL"`), which is also the A5 scope. `e2e-prepare.ts` is football-only, so
//      this spec is paired with `scripts/e2e-prepare-basketball.ts`.
//   2. NEXT_PUBLIC_OFFLINE_SCORING_ENABLED=true must be in the BUILD (it is an inline), so the environment needs a deploy,
//      not a restart.
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "E2E-test-password-2026";
const FIXTURE_ID = process.env.E2E_FIXTURE_ID;

const scoreLocator = (page: import("@playwright/test").Page) => page.locator("p.text-5xl");

test.describe("offline scoring", () => {
  test.skip(!EMAIL || !FIXTURE_ID, "E2E_ADMIN_EMAIL / E2E_FIXTURE_ID are required");

  test("a tap taken offline is queued, then replayed so the score changes on reconnect", async ({ page, context }) => {
    // The reconnect assertion polls by reloading the console, so the default 30 s test budget is not enough: the poll
    // itself is allowed 60 s (drain interval + replay + reload). Without this line the test times out BEFORE its own poll
    // does, and reports "the queued tap never reached the server" for a drain that may simply still be in flight.
    test.setTimeout(150_000);
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(EMAIL!);
    await page.locator('input[name="password"]').fill(PASSWORD!);
    await page.getByRole("button", { name: /access system/i }).click();
    await expect(page.locator('input[name="password"]')).toHaveCount(0, { timeout: 25_000 });

    const consoleResponse = await page.goto(`/games/${FIXTURE_ID}/live`);
    expect(consoleResponse?.status(), "the capture console must render for the prepared fixture").toBe(200);
    await expect(scoreLocator(page)).toHaveCount(2, { timeout: 20_000 });
    const homeBefore = Number((await scoreLocator(page).first().innerText()).trim());

    // Give the console its mount work (attachServerGame writes the local game row) before cutting the network.
    await expect(page.getByRole("button", { name: /^\+2$/ }).first()).toBeVisible({ timeout: 20_000 });

    // Airplane mode: navigator.onLine false, every request fails.
    await context.setOffline(true);
    await expect.poll(async () => page.evaluate(() => navigator.onLine), { timeout: 5_000 }).toBe(false);

    await page.getByRole("button", { name: /^\+2$/ }).first().click();

    // The acknowledgement renders only after captureScoreTap has written the event to IndexedDB and the outbox, so it is
    // the "durably queued" proof rather than a UI flourish.
    await expect(page.getByText(/Captured offline/i)).toBeVisible({ timeout: 10_000 });

    // Documented design: the score does NOT move while offline (no local score projection; replay recomputes before/after
    // from the server's fixture row). Asserting it keeps that decision deliberate rather than accidental.
    expect(
      Number((await scoreLocator(page).first().innerText()).trim()),
      "the local score must not move while offline - the queue acknowledgement is the feedback",
    ).toBe(homeBefore);

    // The outbox holds exactly the one record we just queued (read through the same IndexedDB the component wrote).
    const queued = await page.evaluate(async () => {
      const open = await new Promise<IDBDatabase | null>((resolve) => {
        const request = indexedDB.open("ultra-offline-scoring");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      });
      if (!open) return -1;
      return new Promise<number>((resolve) => {
        const request = open.transaction("outbox", "readonly").objectStore("outbox").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(-1);
      });
    });
    expect(queued, "the tap must have produced exactly one outbox record").toBe(1);

    // Reconnect: startAutoSync fires drain() on the online event, the batch posts to /api/sync/outbox, the server replays
    // the record through the same effects a live tap uses (A5 Step 7) and the fixture score moves.
    await context.setOffline(false);

    await expect
      .poll(
        async () => {
          await page.goto(`/games/${FIXTURE_ID}/live`);
          await expect(scoreLocator(page)).toHaveCount(2, { timeout: 20_000 });
          return Number((await scoreLocator(page).first().innerText()).trim());
        },
        { timeout: 60_000, intervals: [2_000], message: "the queued tap never reached the server after reconnect" },
      )
      .toBeGreaterThan(homeBefore);

    // And the queue is empty again - the drain acknowledged the record rather than retrying it forever.
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const open = await new Promise<IDBDatabase | null>((resolve) => {
              const request = indexedDB.open("ultra-offline-scoring");
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => resolve(null);
            });
            if (!open) return -1;
            // PENDING, not "rows in the store": a synced record is kept with syncedAt set (that is the local audit trail),
            // so a raw count never reaches zero. This mirrors the console's own pendingCount predicate.
            return new Promise<number>((resolve) => {
              const request = open.transaction("outbox", "readonly").objectStore("outbox").getAll();
              request.onsuccess = () =>
                resolve(
                  (request.result as { syncedAt?: string; deadLetteredAt?: string }[]).filter(
                    (record) => !record.syncedAt && !record.deadLetteredAt,
                  ).length,
                );
              request.onerror = () => resolve(-1);
            });
          }),
        { timeout: 30_000, intervals: [1_000], message: "the outbox still holds a pending record after reconnect" },
      )
      .toBe(0);
  });
});
