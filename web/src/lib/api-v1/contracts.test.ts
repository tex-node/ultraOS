import assert from "node:assert/strict";
import test from "node:test";
import { clubPublicId, honestClock } from "./contracts";

test("clubPublicId lowercases the club shortName", () => {
  assert.equal(clubPublicId("VORTEX"), "vortex");
  assert.equal(clubPublicId("Apex"), "apex");
});

test("honestClock forces running=false for a FINAL game even if the stored flag says otherwise", () => {
  const result = honestClock("FINAL", { remainingSeconds: 20, running: true });
  assert.deepEqual(result, { remainingSeconds: 20, running: false });
});

test("honestClock leaves a LIVE game's clock untouched", () => {
  const result = honestClock("LIVE", { remainingSeconds: 300, running: true });
  assert.deepEqual(result, { remainingSeconds: 300, running: true });
});
