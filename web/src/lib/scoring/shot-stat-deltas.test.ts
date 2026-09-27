// mergeShotStatDeltas didn't have a dedicated test before A3a Batch S relocated it out of
// web/src/app/games/actions.ts (it wasn't independently exported/importable before the move).
// The relocation itself is a byte-for-byte copy - verified by diff against the pre-move
// version, not a reimplementation - so this test's job is to establish real coverage for the
// piece that's genuinely pure and testable, not to "prove" the move didn't change anything.

import { mergeShotStatDeltas } from "./shot-stat-deltas";
import type { ShotStatDeltas } from "@/lib/ultra-scoring-engine";
import assert from "node:assert/strict";
import test from "node:test";

const zeroDeltas: ShotStatDeltas = {
  fieldGoalsMade: 0,
  fieldGoalsAttempted: 0,
  twoPointsMade: 0,
  twoPointsAttempted: 0,
  threePointsMade: 0,
  threePointsAttempted: 0,
  fourPointsMade: 0,
  fourPointsAttempted: 0,
  freeThrowsMade: 0,
  freeThrowsAttempted: 0,
  ultraTimeFieldGoalsMade: 0,
  ultraTimeFieldGoalsAttempted: 0,
  ultraTimeTwoPointsMade: 0,
  ultraTimeTwoPointsAttempted: 0,
  ultraTimeThreePointsMade: 0,
  ultraTimeThreePointsAttempted: 0,
  ultraTimeFourPointsMade: 0,
  ultraTimeFourPointsAttempted: 0,
  ultraTimeFreeThrowsMade: 0,
  ultraTimeFreeThrowsAttempted: 0,
};

test("mergeShotStatDeltas: a null existing row (first shot ever) becomes real zeros plus the delta, not null", () => {
  const merged = mergeShotStatDeltas(null, { ...zeroDeltas, fieldGoalsMade: 1, fieldGoalsAttempted: 2 });
  assert.equal(merged.fieldGoalsMade, 1);
  assert.equal(merged.fieldGoalsAttempted, 2);
  assert.equal(merged.threePointsMade, 0);
});

test("mergeShotStatDeltas: an existing row with null fields (never touched by a native shot) treats null as 0, not NaN", () => {
  const merged = mergeShotStatDeltas({ fieldGoalsMade: null, fieldGoalsAttempted: null }, { ...zeroDeltas, fieldGoalsMade: 1, fieldGoalsAttempted: 3 });
  assert.equal(merged.fieldGoalsMade, 1);
  assert.equal(merged.fieldGoalsAttempted, 3);
});

test("mergeShotStatDeltas: an existing populated row accumulates the delta additively", () => {
  const existing = { fieldGoalsMade: 5, fieldGoalsAttempted: 10, threePointsMade: 2 };
  const merged = mergeShotStatDeltas(existing, { ...zeroDeltas, fieldGoalsMade: 1, fieldGoalsAttempted: 2 });
  assert.equal(merged.fieldGoalsMade, 6);
  assert.equal(merged.fieldGoalsAttempted, 12);
  assert.equal(merged.threePointsMade, 2);
});

test("mergeShotStatDeltas: a negated delta (void/correction reversal) subtracts back to the prior value", () => {
  const existing = { fieldGoalsMade: 6, fieldGoalsAttempted: 12 };
  const reversed: ShotStatDeltas = { ...zeroDeltas, fieldGoalsMade: -1, fieldGoalsAttempted: -2 };
  const merged = mergeShotStatDeltas(existing, reversed);
  assert.equal(merged.fieldGoalsMade, 5);
  assert.equal(merged.fieldGoalsAttempted, 10);
});

test("mergeShotStatDeltas: every field in the delta shape is present in the output, even when zero", () => {
  const merged = mergeShotStatDeltas(null, zeroDeltas);
  for (const key of Object.keys(zeroDeltas) as (keyof ShotStatDeltas)[]) {
    assert.equal(merged[key], 0, `expected ${key} to be a real 0, not missing/undefined`);
  }
});
