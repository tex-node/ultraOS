import assert from "node:assert/strict";
import test from "node:test";
import { sessionVersionMatches, tokenSessionVersion } from "@/lib/session-version";

test("a token's claim is its version; a missing or malformed claim is 0", () => {
  assert.equal(tokenSessionVersion({ sessionVersion: 3 }), 3);
  assert.equal(tokenSessionVersion({}), 0);
  assert.equal(tokenSessionVersion({ sessionVersion: "3" }), 0);
  assert.equal(tokenSessionVersion({ sessionVersion: null }), 0);
});

test("the current device stays signed in; every other device is signed out", () => {
  // Same version: the device that just signed in (or never changed its password).
  assert.equal(sessionVersionMatches({ sessionVersion: 1 }, 1), true);
  assert.equal(sessionVersionMatches({}, 0), true);

  // Another device's older token stops matching once the password changes.
  assert.equal(sessionVersionMatches({ sessionVersion: 1 }, 2), false);
  assert.equal(sessionVersionMatches({}, 1), false);
  // Tokens can never be ahead of the row.
  assert.equal(sessionVersionMatches({ sessionVersion: 2 }, 1), false);
});
