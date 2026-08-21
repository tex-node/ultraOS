import assert from "node:assert/strict";
import test from "node:test";
import { corsHeaders } from "./cors";

test("corsHeaders returns nothing for a request with no Origin header (same-origin/non-browser callers are unaffected)", () => {
  const request = new Request("https://example.com");
  assert.deepEqual(corsHeaders(request), {});
});

test("corsHeaders returns nothing for an Origin not on the allow-list", () => {
  const original = process.env.PUBLIC_API_ALLOWED_ORIGINS;
  process.env.PUBLIC_API_ALLOWED_ORIGINS = "https://app.neonultra.ng";
  try {
    const request = new Request("https://example.com", { headers: { origin: "https://evil.example" } });
    assert.deepEqual(corsHeaders(request), {});
  } finally {
    process.env.PUBLIC_API_ALLOWED_ORIGINS = original;
  }
});

test("corsHeaders allows an Origin explicitly on the allow-list", () => {
  const original = process.env.PUBLIC_API_ALLOWED_ORIGINS;
  process.env.PUBLIC_API_ALLOWED_ORIGINS = "https://app.neonultra.ng,https://partner.example";
  try {
    const request = new Request("https://example.com", { headers: { origin: "https://partner.example" } });
    const headers = corsHeaders(request) as Record<string, string>;
    assert.equal(headers["Access-Control-Allow-Origin"], "https://partner.example");
  } finally {
    process.env.PUBLIC_API_ALLOWED_ORIGINS = original;
  }
});

test("corsHeaders never returns a wildcard", () => {
  const original = process.env.PUBLIC_API_ALLOWED_ORIGINS;
  process.env.PUBLIC_API_ALLOWED_ORIGINS = "https://app.neonultra.ng";
  try {
    const request = new Request("https://example.com", { headers: { origin: "https://app.neonultra.ng" } });
    const headers = corsHeaders(request) as Record<string, string>;
    assert.notEqual(headers["Access-Control-Allow-Origin"], "*");
  } finally {
    process.env.PUBLIC_API_ALLOWED_ORIGINS = original;
  }
});
