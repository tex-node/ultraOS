import { expect, test } from "@playwright/test";

// Live scoring through the capture console (streak v21, Prompt 2).
//
// The console is the highest-risk screen in the product: it is where a wrong tap becomes a wrong score in front of a
// crowd. Until now it was covered by a component test with a mocked action and by service-level proofs - never by a
// browser clicking the button that a scorer clicks.
//
// The preparation is not done here: the runner creates a LIVE fixture with a game and passes E2E_FIXTURE_ID, because a
// spec that invents its own data cannot tell you whether the REAL pipeline works.
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const FIXTURE_ID = process.env.E2E_FIXTURE_ID;

// The console renders each side's score in a <p class="mt-1 text-5xl font-black sm:text-6xl">, home first. Reading the
// two big numbers is precise; an earlier version summed every number on the page and ended up measuring the clock
// ("45:00" made the baseline 45, so a goal could never be detected).
const scoreLocator = (page: import("@playwright/test").Page) => page.locator("p.text-5xl");

test.describe("live scoring console", () => {
  test.skip(!EMAIL || !PASSWORD || !FIXTURE_ID, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_FIXTURE_ID are required");

  test("an admin signs in and a scoring tap changes the score", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(EMAIL!);
    await page.locator('input[name="password"]').fill(PASSWORD!);
    // "Access system", not /sign in|log in/ - that regex matches "Sign in with Google", so an earlier version of this
    // spec launched OAuth and failed three steps later pointing at the wrong thing.
    await page.getByRole("button", { name: /access system/i }).click();
    await expect(page.locator('input[name="password"]')).toHaveCount(0, { timeout: 25_000 });

    const consoleResponse = await page.goto(`/games/${FIXTURE_ID}/live`);
    expect(consoleResponse?.status(), "the capture console must render for the prepared fixture").toBe(200);

    await expect(scoreLocator(page)).toHaveCount(2, { timeout: 20_000 });
    const homeBefore = Number((await scoreLocator(page).first().innerText()).trim());

    // The scoring buttons are sport-aware: football says Goal, basketball offers point values. Match whichever scoring
    // control this console offers, and fail with the list of what it DID offer rather than a bare "not found".
    const candidates = [/^\+?2$/i, /^goal$/i, /^basket$/i, /^point$/i, /^try$/i, /^run$/i, /^set$/i];
    let clicked = false;
    for (const name of candidates) {
      const button = page.getByRole("button", { name }).first();
      if (await button.count()) {
        await button.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      const labels = await page.getByRole("button").allInnerTexts();
      throw new Error(`no scoring button matched; the console offers: ${labels.join(" | ").slice(0, 400)}`);
    }

    // A scoring tap posts a form and the page re-renders; the home score must go up.
    await expect
      .poll(async () => Number((await scoreLocator(page).first().innerText()).trim()), {
        timeout: 20_000,
        message: "the home score did not increase after a scoring tap",
      })
      .toBeGreaterThan(homeBefore);
  });
});
