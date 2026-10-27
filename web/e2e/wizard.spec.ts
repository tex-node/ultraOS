import { expect, test } from "@playwright/test";

// The setup wizard, clicked through (streak v21, Prompt 2).
//
// The wizard is the first thing a new customer touches, and its five steps are pure client state until the final submit:
// a broken Next button, a hidden input that stops being submitted, or a step that renders the wrong field would all pass
// every service-level test and fail here. That is exactly the class of defect the v20 proof could not see.
//
// It creates a REAL competition with a unique name, so the runner's cleanup stage deletes anything named e2e-wizard-*.
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe("setup wizard", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are required");

  test("an admin creates a competition through all five steps", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const competitionName = `E2E Wizard ${stamp}`;

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(EMAIL!);
    await page.locator('input[name="password"]').fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await expect(page.locator('input[name="password"]')).toHaveCount(0, { timeout: 20_000 });

    await page.goto("/admin/setup-wizard");
    await expect(page.getByRole("heading", { name: /set up a league/i })).toBeVisible();

    // Step 1 - sport.
    await page.getByRole("button", { name: "Football", exact: true }).click();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 2 - league name.
    await page.locator('input[name="competitionName"]').fill(competitionName);
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 3 - participants. Two teams is the minimum the wizard will advance on.
    await page.locator('textarea[name="participants"]').fill(`E2E Alpha ${stamp}\nE2E Beta ${stamp}`);
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 4 - format. Round robin is the default; assert the choice is visible before advancing.
    await expect(page.getByRole("button", { name: /round robin/i })).toBeVisible();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 5 - the review sentence names what will be created, then one button writes it all.
    await expect(page.getByText(competitionName, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: /create league/i }).click();

    // Success is the confirmation with the fixture count and a link to the new tournament site.
    await expect(page.getByText(/created \d+ participants and \d+ fixtures/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: /open the tournament site/i })).toBeVisible();
  });
});
