import { buildVoidData } from "./void-data";
import assert from "node:assert/strict";
import test from "node:test";

test("builds all four VOIDED fields from the given reason/actor/time", () => {
  const now = new Date("2026-09-28T10:00:00.000Z");
  const data = buildVoidData("wrong shot recorded", "user-1", now);
  assert.deepEqual(data, {
    status: "VOIDED",
    correctedAt: now,
    correctedById: "user-1",
    correctionReason: "wrong shot recorded",
  });
});

test("defaults `now` to the current time when not supplied", () => {
  const before = Date.now();
  const data = buildVoidData("reason", "user-1");
  const after = Date.now();
  assert.ok(data.correctedAt.getTime() >= before && data.correctedAt.getTime() <= after);
});
