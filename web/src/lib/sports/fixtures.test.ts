import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLadderResults,
  generateDoubleElimination,
  generateFixtures,
  generateGroupStage,
  generateKnockout,
  generateLadderRound,
  generateRoundRobin,
  generateSwissRound,
  pairLosersRound,
  splitIntoGroups,
} from "@/lib/sports/fixtures";

function unorderedPairs(fixtures: Array<{ homeEntrantId: string; awayEntrantId: string }>): string[] {
  return fixtures.map((fixture) => [fixture.homeEntrantId, fixture.awayEntrantId].sort().join("-")).sort();
}

test("single round-robin pairs every team once with no self-matches", () => {
  const teams = ["a", "b", "c", "d"];
  const fixtures = generateRoundRobin(teams);
  assert.equal(fixtures.length, 6);
  assert.deepEqual(unorderedPairs(fixtures), ["a-b", "a-c", "a-d", "b-c", "b-d", "c-d"]);
  assert.equal(fixtures.every((fixture) => fixture.homeEntrantId !== fixture.awayEntrantId), true);
});

test("odd team counts drop byes and still pair everyone once", () => {
  const teams = ["a", "b", "c", "d", "e"];
  const fixtures = generateRoundRobin(teams);
  assert.equal(fixtures.length, 10);
  assert.equal(fixtures.some((fixture) => fixture.homeEntrantId === "__BYE__" || fixture.awayEntrantId === "__BYE__"), false);
  const perTeam = new Map<string, number>();
  for (const fixture of fixtures) {
    perTeam.set(fixture.homeEntrantId, (perTeam.get(fixture.homeEntrantId) ?? 0) + 1);
    perTeam.set(fixture.awayEntrantId, (perTeam.get(fixture.awayEntrantId) ?? 0) + 1);
  }
  assert.deepEqual([...perTeam.values()], [4, 4, 4, 4, 4]);
});

test("double round-robin doubles fixtures with reversed home and away", () => {
  const teams = ["a", "b", "c"];
  const fixtures = generateRoundRobin(teams, { doubleRound: true });
  assert.equal(fixtures.length, 6);
  const forward = fixtures.filter((fixture) => fixture.homeEntrantId === "a" && fixture.awayEntrantId === "b");
  const reverse = fixtures.filter((fixture) => fixture.homeEntrantId === "b" && fixture.awayEntrantId === "a");
  assert.equal(forward.length, 1);
  assert.equal(reverse.length, 1);
});

test("knockout draw for a power-of-two bracket has no byes", () => {
  const draw = generateKnockout(["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.equal(draw.size, 8);
  assert.equal(draw.rounds, 3);
  assert.equal(draw.firstRound.length, 4);
  assert.equal(draw.byes.length, 0);
  // Seed 1 (a) and seed 2 (b) cannot meet in the first round.
  assert.equal(draw.firstRound.some((fixture) => fixture.homeEntrantId === "a" && fixture.awayEntrantId === "b"), false);
});

test("knockout draw pads a non-power-of-two bracket with byes", () => {
  const draw = generateKnockout(["a", "b", "c", "d", "e", "f"]);
  assert.equal(draw.size, 8);
  assert.equal(draw.rounds, 3);
  assert.equal(draw.byes.length, 2);
  assert.equal(draw.firstRound.length, 2);
  assert.deepEqual(draw.byes.sort(), ["a", "b"]);
  // Bye positions are the round-1 slots with no fixture, and together with the fixtures fill the
  // bracket without overlap.
  assert.equal(draw.byePositions.length, 2);
  const fixturePositions = new Set(draw.firstRound.map((fixture) => fixture.bracketPosition));
  for (const bye of draw.byePositions) {
    assert.equal(fixturePositions.has(bye.position), false);
    assert.ok(draw.byes.includes(bye.entrantId));
  }
  const allPositions = new Set([...fixturePositions, ...draw.byePositions.map((bye) => bye.position)]);
  assert.equal(allPositions.size, draw.size / 2);
});

test("group stage runs round-robin within seeded groups", () => {
  const teams = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const groups = splitIntoGroups(teams, 2);
  assert.deepEqual(groups, [
    ["1", "4", "5", "8"],
    ["2", "3", "6", "7"],
  ]);

  const fixtures = generateGroupStage(teams, 2);
  assert.equal(fixtures.length, 12); // 6 per group of 4
  assert.deepEqual([...new Set(fixtures.map((fixture) => fixture.group))].sort(), ["A", "B"]);
  assert.equal(fixtures.filter((fixture) => fixture.group === "A").length, 6);
});

test("generateFixtures dispatches by format", () => {
  const teams = ["a", "b", "c", "d"];
  assert.equal(generateFixtures("ROUND_ROBIN", teams).length, 6);
  assert.equal(generateFixtures("KNOCKOUT", teams).length, 2);
  assert.equal(generateFixtures("GROUP_STAGE", teams, { groupCount: 2 }).length, 2);
});

test("swiss pairs equal records and never repeats a matchup", () => {
  const round = generateSwissRound(
    [
      { entrantId: "a", points: 6, opponents: ["b"], hasHadBye: false },
      { entrantId: "b", points: 6, opponents: ["a"], hasHadBye: false },
      { entrantId: "c", points: 3, opponents: [], hasHadBye: false },
      { entrantId: "d", points: 3, opponents: [], hasHadBye: false },
    ],
    3,
  );
  assert.equal(round.fixtures.length, 2);
  // a and b have met, so they must split across the two fixtures.
  const sides = round.fixtures.map((f) => [f.homeEntrantId, f.awayEntrantId].sort().join("-")).sort();
  assert.deepEqual(sides, ["a-c", "b-d"]);
  assert.deepEqual(round.byes, []);
  assert.ok(round.fixtures.every((f) => f.round === 3));
});

test("swiss gives the bye to the lowest-ranked bye-virgin on odd counts", () => {
  const round = generateSwissRound(
    [
      { entrantId: "a", points: 6, opponents: [], hasHadBye: false },
      { entrantId: "b", points: 3, opponents: [], hasHadBye: true },
      { entrantId: "c", points: 0, opponents: [], hasHadBye: false },
    ],
    2,
  );
  assert.deepEqual(round.byes, ["c"]);
  assert.equal(round.fixtures.length, 1);
});

test("double elimination opens with a seeded winners round", () => {
  const draw = generateDoubleElimination(["a", "b", "c", "d", "e", "f"]);
  assert.equal(draw.size, 8);
  assert.equal(draw.winnersFirstRound.length, 2);
  assert.equal(draw.winnersByes.length, 2);
  assert.ok(draw.winnersFirstRound.every((f) => f.round === 1));
});

test("losers rounds pair in order with byes reported, not self-matches", () => {
  const round = pairLosersRound(["l1", "l2", "l3"], 2);
  assert.equal(round.fixtures.length, 1);
  assert.deepEqual(round.byes, ["l3"]);
  assert.notEqual(round.fixtures[0].homeEntrantId, round.fixtures[0].awayEntrantId);
});

test("ladder pairs adjacent rungs and an upset climbs exactly one rung", () => {
  const fixtures = generateLadderRound(["a", "b", "c", "d", "e"], 1);
  assert.deepEqual(
    fixtures.map((f) => [f.homeEntrantId, f.awayEntrantId]),
    [["a", "b"], ["c", "d"]],
  );
  // e sits out on the odd count.
  assert.equal(applyLadderResults(["a", "b", "c", "d", "e"], [{ winnerId: "d", loserId: "c" }]).join(""), "abdce");
  // A favourite holding serve changes nothing.
  assert.equal(applyLadderResults(["a", "b", "c"], [{ winnerId: "a", loserId: "b" }]).join(""), "abc");
});
test("generateFixtures dispatches the new formats", () => {
  const teams = ["a", "b", "c", "d"];
  const swiss = generateFixtures("SWISS", teams);
  assert.equal(swiss.length, 2);
  assert.ok(swiss.every((f) => f.round === 1));

  const de = generateFixtures("DOUBLE_ELIMINATION", teams);
  assert.equal(de.length, 2);

  const ladder = generateFixtures("LADDER", ["a", "b", "c"]);
  assert.equal(ladder.length, 1);
  assert.deepEqual([ladder[0].homeEntrantId, ladder[0].awayEntrantId], ["a", "b"]);
});
