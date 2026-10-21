import assert from "node:assert/strict";
import test from "node:test";
import { computeEloRatings, eloWinProbability, marginMultiplier, DEFAULT_ELO, type EloGame } from "@/lib/analytics/elo";

const game = (homeKey: string, awayKey: string, homeScore: number, awayScore: number, drawsAllowed = true): EloGame => ({
  homeKey,
  awayKey,
  homeScore,
  awayScore,
  drawsAllowed,
});

test("a team that keeps winning climbs, and the gap grows with each result", () => {
  const games = Array.from({ length: 10 }, () => game("A", "B", 90, 70));
  const table = computeEloRatings(games);
  const a = table.get("A")!;
  const b = table.get("B")!;
  assert.ok(a.rating > b.rating + 200, `A ${a.rating} should be far above B ${b.rating} after ten wins`);
  assert.equal(a.wins, 10);
  assert.equal(b.losses, 10);
  assert.ok(a.rating > DEFAULT_ELO.initial && b.rating < DEFAULT_ELO.initial);
});

test("a 10-0 team outranks a 0-10 team by a wide margin", () => {
  // The exact shape the prompt asks to verify, as a unit test: two disjoint schedules, one perfect, one winless.
  const games: EloGame[] = [
    ...Array.from({ length: 10 }, () => game("GOOD", "MID", 88, 70)),
    ...Array.from({ length: 10 }, () => game("MID", "BAD", 88, 70)),
  ];
  const table = computeEloRatings(games);
  const good = table.get("GOOD")!.rating;
  const bad = table.get("BAD")!.rating;
  assert.ok(good - bad > 250, `expected a wide gap, got GOOD ${good} and BAD ${bad}`);
  // The gap has to be meaningful in the currency that matters: the pre-match probability.
  assert.ok(eloWinProbability(good, bad) > 0.8, `GOOD should be a clear favourite, got ${eloWinProbability(good, bad)}`);
});

test("a draw moves both ratings a little, not at all in opposite directions", () => {
  const table = computeEloRatings([game("A", "B", 80, 80)]);
  const a = table.get("A")!;
  const b = table.get("B")!;
  assert.equal(a.draws, 1);
  assert.equal(b.draws, 1);
  // Equal ratings and a draw: the home side loses a sliver of its home edge, the away side gains it.
  assert.ok(Math.abs(a.rating - DEFAULT_ELO.initial) < 5);
  assert.ok(Math.abs(b.rating - DEFAULT_ELO.initial) < 5);
});

test("a no-draw sport ignores a level result rather than scoring it as a draw", () => {
  const table = computeEloRatings([game("A", "B", 80, 80, false)]);
  assert.equal(table.size, 0, "a level basketball result is not a game the engine should rate");
});

test("margin matters: the same win by more is worth more", () => {
  const close = computeEloRatings([game("A", "B", 101, 99)]);
  const blowout = computeEloRatings([game("A", "B", 130, 90)]);
  assert.ok(blowout.get("A")!.rating > close.get("A")!.rating, "a blowout should move the rating further");
  assert.ok(marginMultiplier(1) < marginMultiplier(20));
  assert.ok(marginMultiplier(1000) <= DEFAULT_ELO.maxMarginMultiplier, "the multiplier is capped");
});

test("beating a stronger opponent is worth more than beating a weaker one", () => {
  // Establish a strength order first: STRONG beats MID, MID beats WEAK.
  const seed = [
    ...Array.from({ length: 6 }, () => game("STRONG", "MID", 95, 70)),
    ...Array.from({ length: 6 }, () => game("MID", "WEAK", 95, 70)),
  ];
  const seedTable = computeEloRatings(seed);
  const strong = seedTable.get("STRONG")!.rating;
  const weak = seedTable.get("WEAK")!.rating;
  assert.ok(strong > weak, "the seed should establish a strength order");

  // Now an outsider with no history beats STRONG once, versus beating WEAK once.
  const beatStrong = computeEloRatings([...seed, game("OUTSIDER", "STRONG", 95, 70)]).get("OUTSIDER")!.rating;
  const beatWeak = computeEloRatings([...seed, game("OUTSIDER", "WEAK", 95, 70)]).get("OUTSIDER")!.rating;
  assert.ok(beatStrong > beatWeak, `beating STRONG (${beatStrong}) must be worth more than beating WEAK (${beatWeak})`);
});

test("the pre-match probability is the same expectation the update uses", () => {
  const strong = eloWinProbability(1700, 1500);
  const even = eloWinProbability(1500, 1500);
  const weak = eloWinProbability(1300, 1500);
  assert.ok(strong > 0.6 && strong < 0.95, `strong should be favoured, got ${strong}`);
  assert.ok(weak < 0.4, `weak should be the underdog, got ${weak}`);
  assert.ok(Math.abs(even - 0.5) < 0.1, `level ratings with home advantage should be near even, got ${even}`);
  assert.ok(strong + weak > 0.9, "the model is symmetric enough to be usable as a prior");
});

test("an empty history is an empty table, not a crash", () => {
  assert.equal(computeEloRatings([]).size, 0);
});

test("the same games always produce the same ratings", () => {
  const games = [game("A", "B", 90, 80), game("B", "C", 70, 70), game("C", "A", 60, 88)];
  assert.deepEqual([...computeEloRatings(games).entries()], [...computeEloRatings(games).entries()]);
});
