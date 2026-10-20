import assert from "node:assert/strict";
import test from "node:test";
import { calculateWinProbability, type WinProbabilityInput } from "@/lib/analytics/win-probability";

const base: WinProbabilityInput = {
  sportKey: "BASKETBALL",
  status: "LIVE",
  homeScore: 0,
  awayScore: 0,
  period: 1,
  periodCount: 4,
  clockSecondsRemaining: 720,
  periodDurationSeconds: 720,
  drawsAllowed: false,
};

test("a basketball lead late in the game is close to certain, and early it is barely a lean", () => {
  const early = calculateWinProbability({ ...base, homeScore: 10, awayScore: 0, period: 1, clockSecondsRemaining: 700 });
  const late = calculateWinProbability({ ...base, homeScore: 10, awayScore: 0, period: 4, clockSecondsRemaining: 120 });
  assert.ok(early.home > 0.6 && early.home < 0.8, `early lead should be a lean, got ${early.home}`);
  assert.ok(late.home > 0.95, `10 up with 2 minutes left should be >95%, got ${late.home}`);
  assert.equal(early.method, "CLOCK_SCORE");
  assert.ok(late.home + late.away === 1 || Math.abs(late.home + late.away - 1) < 1e-9);
});

test("the trailing side gets the complement, not an independent number", () => {
  const result = calculateWinProbability({ ...base, homeScore: 40, awayScore: 55, period: 3, clockSecondsRemaining: 300 });
  assert.ok(result.away > 0.9, `down 15 late should fold, got ${result.away}`);
  assert.equal(result.home + result.away, 1);
});

test("a live game is never reported as certain", () => {
  const result = calculateWinProbability({ ...base, homeScore: 30, awayScore: 2, period: 4, clockSecondsRemaining: 2 });
  assert.ok(result.home <= 0.98, "a live model must not claim 100%");
  assert.ok(result.away >= 0.02, "a live model must not claim 0%");
});

test("football uses goals, not basketball points", () => {
  const late = calculateWinProbability({ sportKey: "FOOTBALL", status: "LIVE", homeScore: 1, awayScore: 0, period: 2, periodCount: 2, clockSecondsRemaining: 120, periodDurationSeconds: 2700, drawsAllowed: true });
  const early = calculateWinProbability({ sportKey: "FOOTBALL", status: "LIVE", homeScore: 1, awayScore: 0, period: 1, periodCount: 2, clockSecondsRemaining: 2400, periodDurationSeconds: 2700, drawsAllowed: true });
  assert.ok(late.home > 0.85, `1-0 at 88 minutes should be strong, got ${late.home}`);
  assert.ok(early.home < 0.75, `1-0 at 5 minutes should be modest, got ${early.home}`);
});

test("tennis reads the set score and the current set's points", () => {
  const twoSetsUp = calculateWinProbability({
    sportKey: "TENNIS",
    status: "LIVE",
    homeScore: 2,
    awayScore: 0,
    period: 3,
    // A best-of-five: 2-0 up with the match still live. (2-0 in a best-of-three would be a completed match, which
    // is FINAL, not a live probability.)
    periodCount: 5,
    pointsToWinPeriod: 6,
    currentPoints: { home: 3, away: 1 },
    drawsAllowed: false,
  });
  const oneSetEach = calculateWinProbability({
    sportKey: "TENNIS",
    status: "LIVE",
    homeScore: 1,
    awayScore: 1,
    period: 3,
    periodCount: 3,
    pointsToWinPeriod: 6,
    currentPoints: { home: 1, away: 4 },
    drawsAllowed: false,
  });
  assert.equal(twoSetsUp.method, "SET_SCORE");
  assert.ok(twoSetsUp.home > 0.85, `two sets up in a best-of-five should be strong, got ${twoSetsUp.home}`);
  assert.ok(oneSetEach.home < 0.45, `a set down in the decider should be less than even, got ${oneSetEach.home}`);
});

test("a cricket chase can favour the side that is behind on runs", () => {
  const comfortable = calculateWinProbability({
    sportKey: "CRICKET",
    status: "LIVE",
    homeScore: 150,
    awayScore: 120,
    period: 2,
    periodCount: 2,
    runsNeeded: 31,
    ballsRemaining: 48,
    currentRunRate: 8.1,
    requiredRunRate: 3.9,
    drawsAllowed: false,
  });
  const desperate = calculateWinProbability({
    sportKey: "CRICKET",
    status: "LIVE",
    homeScore: 150,
    awayScore: 120,
    period: 2,
    periodCount: 2,
    runsNeeded: 31,
    ballsRemaining: 12,
    currentRunRate: 6.5,
    requiredRunRate: 15.5,
    drawsAllowed: false,
  });
  assert.equal(comfortable.method, "CHASE");
  assert.ok(comfortable.away > 0.8, `31 off 48 at 8 an over should favour the chase, got ${comfortable.away}`);
  assert.ok(desperate.away < 0.2, `31 off 12 should be desperate, got ${desperate.away}`);
});

test("pre-match uses the prior and says so", () => {
  const withPrior = calculateWinProbability({ ...base, status: "SCHEDULED", period: 0, clockSecondsRemaining: null, priorHomeWin: 0.72 });
  const withoutPrior = calculateWinProbability({ ...base, status: "SCHEDULED", period: 0, clockSecondsRemaining: null });
  assert.equal(withPrior.method, "PRIOR");
  assert.equal(withPrior.home, 0.72);
  assert.equal(withoutPrior.home, 0.5);
  assert.ok(withPrior.confidence < 0.3, "a prior is a weak claim and must be labelled as such");
});

test("a final result is exact and a drawn final is 50/50", () => {
  const win = calculateWinProbability({ ...base, status: "FINAL", homeScore: 88, awayScore: 80 });
  assert.deepEqual([win.home, win.away, win.method], [1, 0, "FINAL"]);
  const draw = calculateWinProbability({ sportKey: "FOOTBALL", status: "FINAL", homeScore: 1, awayScore: 1, period: 2, periodCount: 2, drawsAllowed: true });
  assert.deepEqual([draw.home, draw.away, draw.method], [0.5, 0.5, "FINAL"]);
});

test("the same state always produces the same number", () => {
  const input: WinProbabilityInput = { ...base, homeScore: 51, awayScore: 47, period: 3, clockSecondsRemaining: 400 };
  const first = calculateWinProbability(input);
  const second = calculateWinProbability(input);
  assert.deepEqual(first, second);
});

test("an unknown state still answers with a labelled 50/50 rather than throwing", () => {
  const result = calculateWinProbability({ ...base, sportKey: "QUIDDITCH", status: "LIVE", period: 1, clockSecondsRemaining: null });
  // The clock model adds a small fixed home edge, so an otherwise empty state is 0.501 rather than exactly 0.5.
  assert.ok(Math.abs(result.home - 0.5) < 0.01, `expected an even split, got ${result.home}`);
  assert.equal(result.method, "CLOCK_SCORE");
});
