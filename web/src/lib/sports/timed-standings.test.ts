import assert from "node:assert/strict";
import test from "node:test";
import { computeTimedLeaderboard, formatRaceTime } from "@/lib/sports/timed-standings";

test("the fastest time is ranked first and the gap is measured from it", () => {
  const rows = computeTimedLeaderboard([
    { key: "a", name: "Ada", seconds: 12.45 },
    { key: "b", name: "Bola", seconds: 13.1 },
    { key: "c", name: "Chidi", seconds: 11.98 },
  ]);
  assert.deepEqual(rows.map((row) => row.name), ["Chidi", "Ada", "Bola"]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3]);
  assert.equal(rows[0].gapSeconds, 0);
  assert.equal(Math.round(rows[1].gapSeconds * 100) / 100, 0.47);
});

test("ties share a rank and the next competitor skips", () => {
  const rows = computeTimedLeaderboard([
    { key: "a", name: "Ada", seconds: 12.45 },
    { key: "b", name: "Bola", seconds: 12.45 },
    { key: "c", name: "Chidi", seconds: 13.1 },
  ]);
  assert.deepEqual(rows.map((row) => row.rank), [1, 1, 3]);
});

test("a competitor's best time counts, not the sum of their runs", () => {
  const rows = computeTimedLeaderboard([
    { key: "a", name: "Ada", seconds: 12.45, side: "HOME" },
    { key: "a", name: "Ada", seconds: 11.9, side: "HOME" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].seconds, 11.9);
  assert.equal(rows[0].finishes, 2, "both finishes are counted even though only the best is ranked");
});

test("unfinished and impossible times are not ranked", () => {
  const rows = computeTimedLeaderboard([
    { key: "a", name: "Ada", seconds: 12.45 },
    { key: "b", name: "Bola", seconds: 0 },
    { key: "c", name: "Chidi", seconds: Number.NaN },
    { key: "d", name: "Dayo", seconds: -3 },
  ]);
  // An athlete who has not finished is absent, not last: a zero would read as a world record.
  assert.deepEqual(rows.map((row) => row.name), ["Ada"]);
});

test("an empty race has no leaderboard rather than a crash", () => {
  assert.deepEqual(computeTimedLeaderboard([]), []);
});

test("race times are read as minutes, seconds and hundredths", () => {
  assert.equal(formatRaceTime(12.456), "0:12.45");
  assert.equal(formatRaceTime(75.5), "1:15.50");
  assert.equal(formatRaceTime(0.99), "0:00.99");
  assert.equal(formatRaceTime(-1), "—");
});
