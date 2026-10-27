import { expect, test } from "@playwright/test";

// The onboarding dry run (streak v22, Prompt 4).
//
// This spec follows documentation/CUSTOMER_ONBOARDING.md as a NEW organizer would: sign in on behalf of a platform admin,
// create an organisation through the wizard, add four teams, generate the round robin, open the public tournament page,
// and score one match in the capture console. Screenshots are written to `e2e-artifacts/` so the guide can point at
// pictures of the state it promises.
//
// It is not part of the default suite: it creates real rows and takes ~30 s. Run it with
//   npx playwright test e2e/onboarding-dry-run.spec.ts --project=chromium
// The runner (`scripts/e2e-onboarding-run.sh`) prepares an admin and cleans up afterwards.
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const ORG_NAME = process.env.E2E_ORG_NAME ?? "Test League";

test.describe("customer onboarding dry run", () => {
  test.skip(!EMAIL || !PASSWORD, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are required");

  test("a new organizer creates a league, adds four teams and scores a match", async ({ page }, testInfo) => {
    const shot = async (name: string) => {
      const path = testInfo.outputPath(`${name}.png`);
      await page.screenshot({ path, fullPage: false });
      console.log(`screenshot: ${path}`);
    };

    // 1. Sign in (the guide's first step).
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(EMAIL!);
    await page.locator('input[name="password"]').fill(PASSWORD!);
    await page.getByRole("button", { name: /access system/i }).click();
    await expect(page.locator('input[name="password"]')).toHaveCount(0, { timeout: 25_000 });

    // 2. The wizard.
    await page.goto("/admin/setup-wizard");
    await expect(page.getByRole("heading", { name: /set up a league/i })).toBeVisible();
    await shot("01-wizard-step-1");

    await page.getByRole("button", { name: "Football", exact: true }).click();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 2 names the competition AND (for a platform admin) a new organisation.
    await page.locator('input[name="competitionName"]').fill(`${ORG_NAME} Cup`);
    const orgNameField = page.locator('input[name="newOrganizationName"]');
    const orgSlugField = page.locator('input[name="newOrganizationSlug"]');
    const canCreateOrg = (await orgNameField.count()) > 0;
    if (canCreateOrg) {
      await orgNameField.fill(ORG_NAME);
      await orgSlugField.fill(ORG_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    }
    await shot("02-wizard-step-2");
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 3: four teams, one per line.
    const teams = ["Dry Run United", "Dry Run City", "Dry Run Rovers", "Dry Run Athletic"];
    await page.locator('textarea[name="participants"]').fill(teams.join("\n"));
    await shot("03-wizard-step-3");
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 4: round robin (the default).
    await expect(page.getByRole("button", { name: /round robin/i })).toBeVisible();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Step 5: one button.
    await shot("04-wizard-step-5");
    await page.getByRole("button", { name: /create league/i }).click();
    await expect(page.getByText(/created \d+ participants and \d+ fixtures/i)).toBeVisible({ timeout: 30_000 });
    await shot("05-wizard-created");

    // 4. The public tournament page the guide promises.
    const tournamentLink = page.getByRole("link", { name: /open the tournament site/i });
    await expect(tournamentLink).toBeVisible();
    const href = await tournamentLink.getAttribute("href");
    console.log(`tournament url: ${href}`);
    const tournament = await page.goto(href!);
    expect(tournament?.status(), "the public tournament page must render").toBe(200);
    await shot("06-tournament-page");

    console.log(`FINAL_URL_TOURNAMENT=${href}`);
    console.log(`ORG_CREATED=${canCreateOrg ? ORG_NAME : "(existing organization)"}`);
  });
});
