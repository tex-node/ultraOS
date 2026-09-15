import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import { TENNIS } from "@/lib/sports/tennis";
import {
  awardPoint,
  evaluateTennis,
  isSetComplete,
  pointLabel,
  tennisConfig,
} from "@/lib/sports/tennis-scoring";

test("tennis is distinguished from volleyball by games-per-set", () => {
  const config = tennisConfig(TENNIS)!;
  assert.equal(config.gamesPerSet, 6);
  assert.equal(config.setsToWin, 3);
  assert.equal(config.tiebreakEnabled, true);
  assert.equal(tennisConfig(VOLLEYBALL), null); // rally-point sets are not games
  assert.equal(tennisConfig(BASKETBALL), null);
});

test("point labels handle 0-15-30-40 and deuce/advantage", () => {
  assert.equal(pointLabel({ home: 0, away: 0 }, "HOME"), "0");
  assert.equal(pointLabel({ home: 1, away: 2 }, "HOME"), "15");
  assert.equal(pointLabel({ home: 2, away: 1 }, "HOME"), "30");
  assert.equal(pointLabel({ home: 3, away: 0 }, "HOME"), "40");
  assert.equal(pointLabel({ home: 3, away: 3 }, "HOME"), "40"); // deuce
  assert.equal(pointLabel({ home: 4, away: 3 }, "HOME"), "AD");
  assert.equal(pointLabel({ home: 4, away: 3 }, "AWAY"), "40");
});

test("a game is won only with a two-point lead after deuce", () => {
  const atDeuce = awardPoint({ home: 3, away: 3 }, "HOME");
  assert.equal(atDeuce.gameWon, false);
  assert.deepEqual(atDeuce.points, { home: 4, away: 3 });
  const game = awardPoint({ home: 4, away: 3 }, "HOME");
  assert.equal(game.gameWon, true);
});

test("set completion follows six-games-by-two or a 7-6 tiebreak", () => {
  const config = tennisConfig(TENNIS)!;
  assert.equal(isSetComplete(config, { home: 6, away: 4 }), true);
  assert.equal(isSetComplete(config, { home: 6, away: 5 }), false);
  assert.equal(isSetComplete(config, { home: 7, away: 5 }), true);
  assert.equal(isSetComplete(config, { home: 7, away: 6 }), true); // tiebreak
  assert.equal(isSetComplete(config, { home: 6, away: 6 }), false);
});

test("a best-of-five match ends at three sets", () => {
  const config = tennisConfig(TENNIS)!;
  const summary = evaluateTennis(config, [
    { period: 1, home: 6, away: 4 },
    { period: 2, home: 4, away: 6 },
    { period: 3, home: 7, away: 6 },
    { period: 4, home: 6, away: 3 },
  ]);
  assert.equal(summary.homeSetsWon, 3);
  assert.equal(summary.awaySetsWon, 1);
  assert.equal(summary.matchWinner, "HOME");
});
