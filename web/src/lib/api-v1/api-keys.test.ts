import { test } from "node:test";
import assert from "node:assert/strict";
import { generateApiKey, hashApiKey, keyFromRequest, TIER_LIMITS } from "./api-key-format";

// Streak v9, Prompt 2. The raw key must never be recoverable from what is stored, the prefix must not be the
// secret, and only the two documented headers may present a key.

test("a generated key carries the prefix, a display fragment and 32 bytes of secret", () => {
  const { rawKey, prefix, keyHash } = generateApiKey();
  assert.match(rawKey, /^ulop_live_[0-9a-f]{8}_[0-9a-f]{64}$/);
  assert.equal(prefix, rawKey.split("_").slice(0, 3).join("_"));
  // The display prefix is a strict prefix of the key, so it identifies it without authenticating it.
  assert.ok(rawKey.startsWith(prefix));
  assert.equal(keyHash, hashApiKey(rawKey));
});

test("the stored hash is sha256 of the raw key, not the key", () => {
  const { rawKey, keyHash } = generateApiKey();
  assert.equal(keyHash.length, 64);
  assert.notEqual(keyHash, rawKey);
  assert.ok(!keyHash.includes(rawKey.slice(-8)), "the hash must not contain the secret");
});

test("two keys never collide", () => {
  const keys = new Set(Array.from({ length: 50 }, () => generateApiKey().keyHash));
  assert.equal(keys.size, 50);
});

test("only Authorization: Bearer and x-api-key present a key", () => {
  const bearer = new Request("https://x/api/v1/live", { headers: { authorization: "Bearer ulop_live_ab_12" } });
  assert.equal(keyFromRequest(bearer), "ulop_live_ab_12");
  const apiKey = new Request("https://x/api/v1/live", { headers: { "x-api-key": "ulop_live_cd_34" } });
  assert.equal(keyFromRequest(apiKey), "ulop_live_cd_34");
  const none = new Request("https://x/api/v1/live");
  assert.equal(keyFromRequest(none), null);
  // A Basic header is not a key, and must not be treated as one.
  const basic = new Request("https://x/api/v1/live", { headers: { authorization: "Basic dXNlcjpwYXNz" } });
  assert.equal(keyFromRequest(basic), null);
});

test("tiers are ordered so a partner can be sold a bigger quota", () => {
  assert.ok(TIER_LIMITS.BASIC < TIER_LIMITS.PRO);
  assert.ok(TIER_LIMITS.PRO < TIER_LIMITS.ENTERPRISE);
});
