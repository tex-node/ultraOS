import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { CRICKET } from "@/lib/sports/cricket";
import { FOOTBALL } from "@/lib/sports/football";
import { isDecidedResult, matchOutcome } from "@/lib/sports/match-result";

test("decided scores resolve to a winner in every sport", () => {
  assert.equal(matchOutcome(FOOTBALL, 2, 1), "HOME");
  assert.equal(matchOutcome(FOOTBALL, 0, 3), "AWAY");
  assert.equal(matchOutcome(CRICKET, 180, 150), "HOME");
  assert.equal(matchOutcome(BASKETBALL, 90, 80), "HOME");
});

test("level scores are permitted only where the sport allows them", () => {
  assert.equal(matchOutcome(FOOTBALL, 1, 1), "DRAW");
  assert.equal(matchOutcome(CRICKET, 150, 150), "TIE");
  assert.equal(matchOutcome(BASKETBALL, 88, 88), null); // basketball cannot be level
  assert.equal(isDecidedResult(BASKETBALL, 88, 88), false);
  assert.equal(isDecidedResult(FOOTBALL, 1, 1), true);
  assert.equal(isDecidedResult(CRICKET, 150, 150), true);
});
