import { expect, test } from "@playwright/test";

// Public player registration through the real form (streak v21, Prompt 2).
//
// This exists because the v20 end-to-end proof called the SERVICE the form calls, not the form. A renamed field or a
// missing hidden input would have passed that proof and failed a real applicant. This test types into the actual inputs
// and submits the actual button.
//
// It needs a competition with an open season. The runner passes its slugs in; there is no sensible default, because
// guessing would silently test whichever competition happened to be first.
const ORG_SLUG = process.env.E2E_ORG_SLUG;
const COMPETITION_SLUG = process.env.E2E_COMPETITION_SLUG;

test.describe("public player registration", () => {
  test.skip(!ORG_SLUG || !COMPETITION_SLUG, "E2E_ORG_SLUG / E2E_COMPETITION_SLUG are required");

  test("a stranger can register, and the receipt names their application", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const email = `e2e-player-${stamp}@example.test`;

    await page.goto(`/register/${ORG_SLUG}/competitions/${COMPETITION_SLUG}/player`);
    await expect(page.getByRole("heading", { name: /player registration/i })).toBeVisible();

    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill(`Player${stamp.slice(-4)}`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="dateOfBirth"]').fill("2004-03-15");
    await page.locator('input[name="position"]').fill("Guard");
    await page.locator('select[name="gender"]').selectOption("FEMALE");

    await page.getByRole("button", { name: /submit registration/i }).click();

    // The receipt is a real page, reachable without a session, and it shows the reference.
    await expect(page.getByRole("heading", { name: /thank you/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/reference:/i)).toBeVisible();
    await expect(page.getByText(email, { exact: false })).toHaveCount(0); // the receipt must not echo the address

    // The page states whether an email went out rather than assuming one did.
    await expect(page.getByText(/confirmation email|no mail server configured/i)).toBeVisible();
  });

  test("a missing required field is refused by the browser, not silently submitted", async ({ page }) => {
    await page.goto(`/register/${ORG_SLUG}/competitions/${COMPETITION_SLUG}/player`);
    await page.locator('input[name="firstName"]').fill("OnlyFirst");
    await page.getByRole("button", { name: /submit registration/i }).click();
    // Still on the form: required fields block submission client-side.
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: /player registration/i })).toBeVisible();
  });
});
