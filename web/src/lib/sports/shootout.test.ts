import assert from "node:assert/strict";
import test from "node:test";
import { shootoutTally, shootoutWinner, type ShootoutKick } from "@/lib/sports/shootout";

function kicks(spec: string): ShootoutKick[] {
  // Uppercase = scored, lowercase = missed. "H/h" = home, "A/a" = away, in kick order.
  return [...spec].map((char) => ({
    side: char.toUpperCase() === "H" ? "HOME" : "AWAY",
    scored: char === char.toUpperCase(),
  }));
}

test("tally counts goals and kicks per side", () => {
  assert.deepEqual(shootoutTally(kicks("HAha")), { home: 1, away: 1, homeTaken: 2, awayTaken: 2 });
});

test("best-of-five decided early when the other cannot catch up", () => {
  // Home 3/3, away 0/3 -> home cannot be caught (away has 2 left).
  assert.equal(shootoutWinner(kicks("HHHaaa")), "HOME");
});

test("not decided while the best-of-five is still live", () => {
  // After four kicks each, 2-2 with one each remaining.
  assert.equal(shootoutWinner(kicks("HHhhAAaa")), null);
});

test("decided after five when the scores differ", () => {
  // Home 4/5, away 3/5.
  assert.equal(shootoutWinner(kicks("HHHHhAAAaa")), "HOME");
});

test("level after five goes to sudden death", () => {
  assert.equal(shootoutWinner(kicks("HHHHHAAAAA")), null); // 5-5
  // Sudden death pair: home scores, away misses.
  assert.equal(shootoutWinner(kicks("HHHHHAAAAAHa")), "HOME");
});

test("not decided in sudden death until both have taken the extra kick", () => {
  assert.equal(shootoutWinner(kicks("HHHHHAAAAAH")), null);
});
