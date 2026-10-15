import { test, expect } from "@playwright/test";

// ADR-011 smoke test: the Coaching Assistant ships dark. With COACHING_ASSISTANT_ENABLED unset (as
// in this run) and for an anonymous visitor, every coaching URL must look like a route that does
// not exist: a plain 404, never a login redirect and never a page that confirms it exists.
test.describe("coaching assistant gate (C3)", () => {
  for (const path of ["/coaching", "/coaching/does-not-exist", "/coaching/does-not-exist/squad", "/coaching/does-not-exist/opponents/other"]) {
    test(`anonymous ${path} is a 404`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  }
});
