import assert from "node:assert/strict";
import test from "node:test";
import { bracketSize, isPowerOfTwo, planNextRound, type BracketMatch } from "@/lib/sports/knockout-advance";

function club(id: string) {
  return { seasonClubId: id, entrantId: null };
}

function decided(round: number, bracketPosition: number, winnerId: string): BracketMatch {
  return { round, bracketPosition, status: "FINAL", winner: club(winnerId) };
}

test("bracket size is twice the round-one positions and must be a power of two", () => {
  assert.equal(bracketSize(4, 0), 8); // 4 first-round fixtures, no byes
  assert.equal(bracketSize(3, 1), 8); // 3 fixtures + 1 bye = 4 positions
  assert.equal(bracketSize(2, 0), 4);
  assert.equal(bracketSize(1, 1), 4); // 3-entrant draw: one fixture, one bye
  assert.equal(bracketSize(1, 0), 2); // head-to-head final only
  assert.equal(bracketSize(5, 0), null); // 5 positions is not a power of two
  assert.equal(bracketSize(0, 0), null);
  assert.equal(isPowerOfTwo(8), true);
  assert.equal(isPowerOfTwo(6), false);
});

test("a three-entrant draw advances the bye straight into the final", () => {
  // generateKnockout(["a","b","c"]) -> size 4: position 1 is a bye (a), position 2 is b v c.
  const plan = planNextRound({
    round: 1,
    size: 4,
    matches: [decided(1, 2, "c")],
    byes: { "1": club("a") },
  });
  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") return;
  assert.deepEqual(plan.fixtures, [
    { round: 2, bracketPosition: 1, home: club("a"), away: club("c") },
  ]);
});

test("waits until every fixture in the round is decided", () => {
  const plan = planNextRound({
    round: 1,
    size: 4,
    matches: [decided(1, 1, "a"), { round: 1, bracketPosition: 2, status: "LIVE", winner: null }],
    byes: {},
  });
  assert.equal(plan.status, "waiting");
});

test("pairs adjacent winners into the next round", () => {
  const plan = planNextRound({
    round: 1,
    size: 4,
    matches: [decided(1, 1, "a"), decided(1, 2, "b")],
    byes: {},
  });
  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") return;
  assert.deepEqual(plan.fixtures, [
    { round: 2, bracketPosition: 1, home: club("a"), away: club("b") },
  ]);
});

test("a round-1 bye auto-advances into the next round", () => {
  // 3 entrants -> size 4, one bye. Position 1 is a bye (a), position 2 has a fixture.
  const plan = planNextRound({
    round: 1,
    size: 4,
    matches: [decided(1, 2, "b")],
    byes: { "1": club("a") },
  });
  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") return;
  assert.deepEqual(plan.fixtures, [
    { round: 2, bracketPosition: 1, home: club("a"), away: club("b") },
  ]);
});

test("an eight-slot bracket advances round by round", () => {
  const matches: BracketMatch[] = [
    decided(1, 1, "a"),
    decided(1, 2, "b"),
    decided(1, 3, "c"),
    decided(1, 4, "d"),
  ];
  const plan = planNextRound({ round: 1, size: 8, matches, byes: {} });
  assert.equal(plan.status, "ready");
  if (plan.status !== "ready") return;
  assert.deepEqual(plan.fixtures.map((fixture) => [fixture.bracketPosition, fixture.home.seasonClubId, fixture.away.seasonClubId]), [
    [1, "a", "b"],
    [2, "c", "d"],
  ]);
});

test("a decided final reports the bracket complete", () => {
  const plan = planNextRound({
    round: 2,
    size: 4,
    matches: [decided(2, 1, "a")],
    byes: {},
  });
  assert.equal(plan.status, "final");
});
