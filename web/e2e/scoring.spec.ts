import { expect, test } from "@playwright/test";

// Live scoring through the capture console (streak v21, Prompt 2).
//
// The console is the highest-risk screen in the product: it is where a wrong tap becomes a wrong score in front of a
// crowd. Until now it was covered by a component test with a mocked action and by service-level proofs - never by a
// browser clicking the button that a scorer clicks.
//
// Preparation is not done here: the runner creates a LIVE fixture with a game and passes E2E_FIXTURE_ID, because a spec
// that invents its own data cannot tell you whether the REAL pipeline works.
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const FIXTURE_ID = process.env.E2E_FIXTURE_ID;

test.describe("live scoring console", () => {
  test.skip(!EMAIL || !PASSWORD || !FIXTURE_ID, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD / E2E_FIXTURE_ID are required");

  test("an admin signs in and a click changes the score", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(EMAIL!);
    await page.locator('input[name="password"]').fill(PASSWORD!);
    // The sign-in button is labelled "Access system". An earlier version matched /sign in|log in/, which selected
    // "Sign in with Google" - so the spec clicked OAuth and never authenticated, and the test failed three steps later
    // pointing at the wrong thing. A browser test that cannot log in must say so at the click, not after the redirect.
    await page.getByRole("button", { name: /access system/i }).click();
    // Wait for the credential POST to land: the login form disappearing means NextAuth issued a session.
    await expect(page.locator('input[name="password"]')).toHaveCount(0, { timeout: 25_000 });

    await page.goto(`/games/${FIXTURE_ID}/live`);
    await expect(page.getByText(/live|score|period/i).first()).toBeVisible({ timeout: 20_000 });

    // Read the score before, score a basket, read it after: the assertion is a DELTA, not a fixed number, so the test
    // does not depend on what the fixture's score happened to be.
    const scoreBefore = await readScore(page);
    const twoPointer = page.getByRole("button", { name: /\+?2|two|field goal/i }).first();
    await expect(twoPointer).toBeVisible({ timeout: 20_000 });
    await twoPointer.click();
    await expect
      .poll(async () => readScore(page), { timeout: 20_000, message: "the score did not change after a scoring tap" })
      .toBeGreaterThan(scoreBefore);
  });
});

async function readScore(page: import("@playwright/test").Page): Promise<number> {
  // The console renders both sides' scores in tabular-nums spans; summing them is enough to detect "it changed", and it
  // stays correct whichever side the tap credited.
  const texts = await page.locator("[data-testid='score'], .tabular-nums").allInnerTexts();
  const numbers = texts
    .join(" ")
    .match(/\d+/g)
    ?.map(Number) ?? [];
  return numbers.reduce((sum, value) => sum + value, 0);
}
