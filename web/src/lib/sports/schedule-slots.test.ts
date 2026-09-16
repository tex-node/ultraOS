import assert from "node:assert/strict";
import test from "node:test";
import { allocateSlot } from "@/lib/sports/schedule-slots";

const base = new Date("2026-01-01T00:00:00.000Z");
const HOUR = 3_600_000;
const TAKEN = () => true;

test("takes the base slot when it is free", () => {
  const result = allocateSlot({ base, stepMs: 2 * HOUR, isTaken: () => false });
  assert.equal(result.conflict, false);
  assert.equal(result.scheduledAt.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("steps forward by the slot length until a free slot is found", () => {
  const taken = new Set(["2026-01-01T00:00:00.000Z", "2026-01-01T02:00:00.000Z"]);
  const result = allocateSlot({ base, stepMs: 2 * HOUR, isTaken: (at) => taken.has(at.toISOString()) });
  assert.equal(result.conflict, false);
  assert.equal(result.scheduledAt.toISOString(), "2026-01-01T04:00:00.000Z");
});

test("reports a conflict when the whole search window is booked", () => {
  const result = allocateSlot({ base, stepMs: HOUR, isTaken: TAKEN, maxAttempts: 5 });
  assert.equal(result.conflict, true);
  assert.equal(result.scheduledAt.toISOString(), base.toISOString());
});

test("a zero or negative step is clamped to one millisecond", () => {
  let calls = 0;
  const result = allocateSlot({
    base,
    stepMs: 0,
    maxAttempts: 3,
    isTaken: () => {
      calls += 1;
      return calls < 3;
    },
  });
  assert.equal(result.conflict, false);
  assert.equal(result.scheduledAt.getTime(), base.getTime() + 2);
});

test("two matches in one round at one venue take consecutive slots instead of clashing", () => {
  const venueSlots = new Set<string>();
  const step = 2 * HOUR;
  const first = allocateSlot({ base, stepMs: step, isTaken: (at) => venueSlots.has(at.toISOString()) });
  venueSlots.add(first.scheduledAt.toISOString());
  const second = allocateSlot({ base, stepMs: step, isTaken: (at) => venueSlots.has(at.toISOString()) });

  assert.equal(first.conflict, false);
  assert.equal(second.conflict, false);
  assert.equal(first.scheduledAt.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(second.scheduledAt.toISOString(), "2026-01-01T02:00:00.000Z");
});
