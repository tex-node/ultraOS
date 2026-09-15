import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_SHORT_LINKS, resolvePublicShortLink } from "@/lib/public-short-links";

test("giesm resolves to the neon-ultra volleyball event", () => {
  assert.deepEqual(resolvePublicShortLink("giesm"), { organizationSlug: "neon-ultra", eventSlug: "giesm" });
  assert.deepEqual(PUBLIC_SHORT_LINKS.giesm, { organizationSlug: "neon-ultra", eventSlug: "giesm" });
});

test("lookup is case-insensitive and trims, and rejects unknown or empty slugs", () => {
  assert.deepEqual(resolvePublicShortLink(" GIESM "), { organizationSlug: "neon-ultra", eventSlug: "giesm" });
  assert.equal(resolvePublicShortLink("nope"), null);
  assert.equal(resolvePublicShortLink(null), null);
  assert.equal(resolvePublicShortLink(""), null);
});
