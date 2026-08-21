import assert from "node:assert/strict";
import test from "node:test";
import { detectLiveMilestones } from "./live-milestones";
import { emptyPlayerStats } from "./event-derived-stats";

test("detectLiveMilestones fires DOUBLE_DIGIT_POINTS at exactly 10, not before", () => {
  const nine = { ...emptyPlayerStats("p1", "c1"), points: 9 };
  const ten = { ...emptyPlayerStats("p2", "c1"), points: 10 };
  const milestones = detectLiveMilestones([nine, ten]);
  assert.equal(milestones.some((m) => m.playerId === "p1"), false);
  assert.deepEqual(milestones.find((m) => m.playerId === "p2"), { playerId: "p2", key: "DOUBLE_DIGIT_POINTS", label: "10 points", statValue: 10 });
});

test("detectLiveMilestones fires FOUR_POINT_MAKE for any nonzero fourPointsMade, pluralized correctly", () => {
  const one = { ...emptyPlayerStats("p1", "c1"), fourPointsMade: 1 };
  const two = { ...emptyPlayerStats("p2", "c1"), fourPointsMade: 2 };
  const milestones = detectLiveMilestones([one, two]);
  assert.equal(milestones.find((m) => m.playerId === "p1")!.label, "1 four-point make");
  assert.equal(milestones.find((m) => m.playerId === "p2")!.label, "2 four-point makes");
});

test("detectLiveMilestones returns nothing for a player below every threshold", () => {
  const p = emptyPlayerStats("p1", "c1");
  assert.deepEqual(detectLiveMilestones([p]), []);
});

test("detectLiveMilestones can fire multiple milestones for the same player", () => {
  const p = { ...emptyPlayerStats("p1", "c1"), points: 12, rebounds: 11, fourPointsMade: 1 };
  const milestones = detectLiveMilestones([p]);
  assert.equal(milestones.length, 3);
});
