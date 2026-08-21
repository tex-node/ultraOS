import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimit, clientKeyFromRequest, _resetRateLimitState } from "./rate-limit";

test("checkRateLimit allows requests under the limit and reports remaining count", () => {
  _resetRateLimitState();
  const first = checkRateLimit("client-a", 1000);
  assert.equal(first.limited, false);
  assert.equal(first.remaining, first.limit - 1);
});

test("checkRateLimit limits a client once they exceed the window's max requests", () => {
  _resetRateLimitState();
  const now = 1000;
  let last;
  for (let i = 0; i < 200; i++) last = checkRateLimit("client-b", now);
  assert.equal(last!.limited, true);
  assert.equal(last!.remaining, 0);
});

test("checkRateLimit tracks separate clients independently", () => {
  _resetRateLimitState();
  for (let i = 0; i < 150; i++) checkRateLimit("heavy-client", 1000);
  const lightClient = checkRateLimit("light-client", 1000);
  assert.equal(lightClient.limited, false);
});

test("checkRateLimit resets a client's window once enough time has passed", () => {
  _resetRateLimitState();
  for (let i = 0; i < 150; i++) checkRateLimit("client-c", 1000);
  const afterWindow = checkRateLimit("client-c", 1000 + 61_000);
  assert.equal(afterWindow.limited, false);
});

test("clientKeyFromRequest uses the first X-Forwarded-For hop", () => {
  const request = new Request("https://example.com", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } });
  assert.equal(clientKeyFromRequest(request), "203.0.113.5");
});

test("clientKeyFromRequest falls back to a constant when no header is present", () => {
  const request = new Request("https://example.com");
  assert.equal(clientKeyFromRequest(request), "unknown");
});
