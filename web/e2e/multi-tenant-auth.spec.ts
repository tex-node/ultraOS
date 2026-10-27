import { expect, test } from "@playwright/test";

// Multi-tenant authentication (streak v22, Prompt 2).
//
// Why this exists: in v21 a single bug meant that NO user of a league other than the platform default could sign in
// usefully - the session's organization was resolved before any tenant context existed, RLS fell back to the default
// organization, and every org-scoped page answered "No league yet". That was found by a browser test, not by the service
// suite, because the service suite runs as the database owner and never meets the policy.
//
// This spec makes that class of bug visible on purpose: two disposable organizations, an admin in each, and an assertion
// that each admin sees their OWN league and not the other's.
const PASSWORD = process.env.E2E_TENANT_PASSWORD;
const A = { slug: process.env.E2E_TENANT_A_SLUG, email: process.env.E2E_TENANT_A_EMAIL };
const B = { slug: process.env.E2E_TENANT_B_SLUG, email: process.env.E2E_TENANT_B_EMAIL };
const BOTH = process.env.E2E_TENANT_BOTH_EMAIL;

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD!);
  // "Access system" - /sign in|log in/ matches the Google button and sends the spec into OAuth.
  await page.getByRole("button", { name: /access system/i }).click();
  await expect(page.locator('input[name="password"]')).toHaveCount(0, { timeout: 25_000 });
}

test.describe("multi-tenant authentication", () => {
  test.skip(!PASSWORD || !A.slug || !B.slug || !BOTH, "run scripts/e2e-tenant-prepare.ts first");

  test("an Org A admin sees Org A, and only Org A", async ({ page }) => {
    await signIn(page, A.email!);
    const response = await page.goto(`/admin/${A.slug}/dashboard`);
    expect(response?.status(), "Org A's own dashboard").toBe(200);
    // Scope to main: the shell has its own heading (now the league name), so an unscoped heading locator is ambiguous -
    // which is what made the first version of this spec fail on a page that was in fact correct.
    await expect(page.locator("main h1").first()).toContainText(/E2E Tenant A/i);

    // The other tenant's dashboard must NOT be reachable by editing the URL: the session is scoped to A.
    const other = await page.goto(`/admin/${B.slug}/dashboard`);
    expect([403, 404]).toContain(other?.status());
  });

  test("an Org B admin sees Org B - not A, and not 'No league yet'", async ({ page }) => {
    await signIn(page, B.email!);
    const response = await page.goto(`/admin/${B.slug}/dashboard`);
    expect(response?.status(), "Org B's own dashboard").toBe(200);
    await expect(page.locator("main h1").first()).toContainText(/E2E Tenant B/i);
    await expect(page.getByText(/No league yet/i)).toHaveCount(0);

    const other = await page.goto(`/admin/${A.slug}/dashboard`);
    expect([403, 404]).toContain(other?.status());
  });

  test("a user with roles in BOTH orgs gets one deterministic context, and no switcher exists", async ({ page }) => {
    await signIn(page, BOTH!);

    // There is no organisation switcher in this product, so "which tenant does this session belong to" has one answer and
    // it must be deterministic: resolveActiveOrganizationId() takes the OLDEST grant, which the preparation script makes
    // Org A. The proof is not a label on a page - it is which tenant's dashboard the session is ALLOWED to open.
    const aStatus = (await page.goto(`/admin/${A.slug}/dashboard`))?.status();
    const bStatus = (await page.goto(`/admin/${B.slug}/dashboard`))?.status();
    console.log(`dual-role user: Org A dashboard -> ${aStatus}, Org B dashboard -> ${bStatus}`);

    expect([aStatus, bStatus].filter((status) => status === 200).length, "exactly one tenant must be reachable").toBe(1);
    expect(aStatus, "the OLDEST grant wins, and that is Org A").toBe(200);
    expect(bStatus, "the other tenant must be refused, not shown").toBe(404);
  });
});
