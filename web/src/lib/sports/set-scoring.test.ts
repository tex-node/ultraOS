import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { TENNIS } from "@/lib/sports/tennis";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import {
  currentSetNumber,
  evaluateSets,
  isSetComplete,
  setScoringConfig,
  setTargetPoints,
} from "@/lib/sports/set-scoring";

test("only rally-point set sports get a set-scoring config", () => {
  const config = setScoringConfig(VOLLEYBALL)!;
  assert.equal(config.pointsToWinPeriod, 25);
  assert.equal(config.decidingPeriodPoints, 15);
  assert.equal(config.winBy, 2);
  assert.equal(config.periodsToWin, 3);
  assert.equal(config.periodCount, 5);

  assert.equal(setScoringConfig(BASKETBALL), null);
  assert.equal(setScoringConfig(TENNIS), null); // tennis sets are games, not rally points
});

test("a set completes only with the required lead", () => {
  const config = setScoringConfig(VOLLEYBALL)!;
  assert.equal(isSetComplete(config, 1, 25, 20), true);
  assert.equal(isSetComplete(config, 1, 25, 24), false); // deuce
  assert.equal(isSetComplete(config, 1, 26, 24), true);
  assert.equal(isSetComplete(config, 5, 15, 13), true); // deciding set target is 15
  assert.equal(isSetComplete(config, 5, 15, 14), false);
  assert.equal(isSetComplete(config, 5, 16, 14), true);
  assert.equal(setTargetPoints(config, 3), 25);
  assert.equal(setTargetPoints(config, 5), 15);
});

test("evaluateSets counts sets won and decides the match", () => {
  const config = setScoringConfig(VOLLEYBALL)!;
  const midway = evaluateSets(config, [
    { period: 1, home: 25, away: 20 },
    { period: 2, home: 20, away: 25 },
    { period: 3, home: 25, away: 22 },
  ]);
  assert.equal(midway.homeSetsWon, 2);
  assert.equal(midway.awaySetsWon, 1);
  assert.equal(midway.matchWinner, null);
  assert.equal(currentSetNumber(config, [
    { period: 1, home: 25, away: 20 },
    { period: 2, home: 20, away: 25 },
    { period: 3, home: 25, away: 22 },
  ]), 4);

  const decided = evaluateSets(config, [
    { period: 1, home: 25, away: 20 },
    { period: 2, home: 20, away: 25 },
    { period: 3, home: 25, away: 22 },
    { period: 4, home: 25, away: 23 },
  ]);
  assert.equal(decided.homeSetsWon, 3);
  assert.equal(decided.matchWinner, "HOME");

  const fiveSet = evaluateSets(config, [
    { period: 1, home: 25, away: 20 },
    { period: 2, home: 20, away: 25 },
    { period: 3, home: 25, away: 22 },
    { period: 4, home: 22, away: 25 },
    { period: 5, home: 16, away: 14 },
  ]);
  assert.equal(fiveSet.matchWinner, "HOME");
  assert.equal(fiveSet.homeSetsWon, 3);
  assert.equal(fiveSet.awaySetsWon, 2);
});
