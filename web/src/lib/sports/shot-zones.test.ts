import assert from "node:assert/strict";
import test from "node:test";
import { isOnCourt, isThreePointZone, shotDistanceFt, shotZone } from "@/lib/sports/shot-zones";

test("at the rim is restricted area", () => {
  assert.equal(shotZone(25, 5.25), "RESTRICTED_AREA");
  assert.equal(shotZone(25, 8), "RESTRICTED_AREA");
});

test("the paint excludes the restricted area", () => {
  assert.equal(shotZone(25, 12), "PAINT");
  assert.equal(shotZone(20, 15), "PAINT");
});

test("corner threes need the corner and the distance", () => {
  assert.equal(shotZone(1, 5), "CORNER_3");
  assert.equal(shotZone(49, 10), "CORNER_3");
  // Same sideline but above the break line is an above-break three, not a corner three.
  assert.equal(shotZone(2, 20), "ABOVE_BREAK_3");
});

test("deep shots are above-the-break threes", () => {
  assert.equal(shotZone(25, 30), "ABOVE_BREAK_3");
  assert.equal(shotZone(10, 25), "ABOVE_BREAK_3");
});

test("everything else in the frontcourt is mid-range", () => {
  assert.equal(shotZone(25, 20), "MID_RANGE");
  assert.equal(shotZone(40, 18), "MID_RANGE");
  assert.equal(shotZone(8, 12), "MID_RANGE");
});

test("past halfway is backcourt", () => {
  assert.equal(shotZone(25, 60), "BACKCOURT");
  assert.equal(shotZone(5, 90), "BACKCOURT");
});

test("coordinate guardrails", () => {
  assert.equal(isOnCourt(25, 30), true);
  assert.equal(isOnCourt(-1, 30), false);
  assert.equal(isOnCourt(25, 95), false);
  assert.equal(isOnCourt(Number.NaN, 30), false);
  assert.equal(shotDistanceFt(25, 5.25), 0);
});

test("three-point zones", () => {
  assert.equal(isThreePointZone("CORNER_3"), true);
  assert.equal(isThreePointZone("ABOVE_BREAK_3"), true);
  assert.equal(isThreePointZone("MID_RANGE"), false);
  assert.equal(isThreePointZone("FREE_THROW"), false);
});