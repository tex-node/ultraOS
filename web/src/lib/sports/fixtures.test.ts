import assert from "node:assert/strict";
import test from "node:test";
import {
  generateFixtures,
  generateGroupStage,
  generateKnockout,
  generateRoundRobin,
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
