import assert from "node:assert/strict";
import test from "node:test";
import { AMERICAN_FOOTBALL } from "@/lib/sports/american-football";
import { BASKETBALL } from "@/lib/sports/basketball";
import { CRICKET } from "@/lib/sports/cricket";
import { FOOTBALL } from "@/lib/sports/football";
import { TENNIS } from "@/lib/sports/tennis";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import { resolveScoringModule, SCORING_MODULES } from "@/lib/sports/scoring-modules";

const baseInput = {
  homeSeasonClubId: "h",
  awaySeasonClubId: "a",
  currentPeriod: 1,
  homeScore: 0,
  awayScore: 0,
  periodScores: [] as { period: number; home: number; away: number }[],
  seasonClubId: "h",
};

test("the registry dispatches one module per scoring family", () => {
  assert.equal(resolveScoringModule(VOLLEYBALL)?.kind, "SETS");
  assert.equal(resolveScoringModule(FOOTBALL)?.kind, "GOALS");
  assert.equal(resolveScoringModule(CRICKET)?.kind, "RUNS");
assert.equal(resolveScoringModule(TENNIS)?.kind, "TENNIS");
assert.equal(resolveScoringModule(AMERICAN_FOOTBALL)?.kind, "POINTS");
assert.equal(resolveScoringModule(BASKETBALL), null); // basketball keeps its dedicated scorer
assert.deepEqual(SCORING_MODULES.map((module) => module.kind), ["TENNIS", "SETS", "GOALS", "RUNS", "RUNS", "POINTS"]);
});

test("volleyball adds a rally point to the current set without finalizing early", () => {
  const scoringModule = resolveScoringModule(VOLLEYBALL)!;
  const result = scoringModule.apply(VOLLEYBALL, { ...baseInput, typeKey: "KILL" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.period, { period: 1, home: 1, away: 0 });
  assert.equal(result.homeScore, 0); // sets won, not points
  assert.equal(result.finalize, false);
});

test("football credits a goal and an own goal to the right side", () => {
  const scoringModule = resolveScoringModule(FOOTBALL)!;
  const goal = scoringModule.apply(FOOTBALL, { ...baseInput, typeKey: "GOAL" });
  assert.equal(goal.ok && goal.homeScore, 1);
  const own = scoringModule.apply(FOOTBALL, { ...baseInput, typeKey: "OWN_GOAL" });
  assert.equal(own.ok && own.awayScore, 1);
});

test("cricket credits runs to the batting side and rejects the non-batting side", () => {
  const scoringModule = resolveScoringModule(CRICKET)!;
  const four = scoringModule.apply(CRICKET, { ...baseInput, typeKey: "FOUR", runs: 4 });
  assert.equal(four.ok, true);
  if (!four.ok) return;
  assert.equal(four.homeScore, 4);
  assert.deepEqual(four.period, { period: 1, home: 4, away: 0 });

  const wrongTeam = scoringModule.apply(CRICKET, { ...baseInput, seasonClubId: "a", typeKey: "RUN", runs: 1 });
  assert.equal(wrongTeam.ok, false);
});

test("cricket concludes the chase when the target is reached", () => {
  const scoringModule = resolveScoringModule(CRICKET)!;
  const result = scoringModule.apply(CRICKET, {
    homeSeasonClubId: "h",
    awaySeasonClubId: "a",
    currentPeriod: 2,
    homeScore: 150,
    awayScore: 149,
    periodScores: [
      { period: 1, home: 150, away: 0 },
      { period: 2, home: 0, away: 149 },
    ],
    seasonClubId: "a",
    typeKey: "SIX",
    runs: 6,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.awayScore, 155);
  assert.equal(result.finalize, true);
  assert.equal(result.finalizeWinner, "AWAY");
});

test("american football credits varied point values and rejects forged ones", () => {
  const scoringModule = resolveScoringModule(AMERICAN_FOOTBALL)!;
  assert.equal(scoringModule.key, "POINTS");

  const touchdown = scoringModule.apply(AMERICAN_FOOTBALL, { ...baseInput, typeKey: "TOUCHDOWN_RUSH", points: 6 });
  assert.equal(touchdown.ok, true);
  if (!touchdown.ok) return;
  assert.equal(touchdown.homeScore, 6);
  assert.equal(touchdown.points, 6);
  assert.equal(touchdown.finalize, false);

  const fieldGoal = scoringModule.apply(AMERICAN_FOOTBALL, { ...baseInput, seasonClubId: "a", typeKey: "FIELD_GOAL", points: 3 });
  assert.equal(fieldGoal.ok, true);
  if (!fieldGoal.ok) return;
  assert.equal(fieldGoal.awayScore, 3);

  const forged = scoringModule.apply(AMERICAN_FOOTBALL, { ...baseInput, typeKey: "FIELD_GOAL", points: 6 });
  assert.equal(forged.ok, false);
  if (forged.ok) return;
  assert.equal(forged.reason, "SCORE_MISMATCH");

  const unknown = scoringModule.apply(AMERICAN_FOOTBALL, { ...baseInput, typeKey: "TOUCHDOWN_DANCE" });
  assert.equal(unknown.ok, false);
});
test("cricket takes its run values from the definition, not the caller", () => {
  // Regression (streak v12): applyDelivery only ever received `input.runs`, so any delivery path that did not pass a
  // value scored ZERO. A full 20-over innings measured 0-0 in the chase script. The definition is authoritative.
  const scoringModule = resolveScoringModule(CRICKET)!;
  const four = scoringModule.apply(CRICKET, { ...baseInput, typeKey: "FOUR" });
  assert.equal(four.ok, true);
  if (!four.ok) return;
  assert.equal(four.homeScore, 4, "a four scores four without the caller passing runs");

  const six = scoringModule.apply(CRICKET, { ...baseInput, typeKey: "SIX" });
  assert.equal(six.ok && six.homeScore, 6, "a six scores six");

  const single = scoringModule.apply(CRICKET, { ...baseInput, typeKey: "RUN" });
  assert.equal(single.ok && single.homeScore, 1, "a plain run scores one by default");

  // A forged value cannot exceed what the definition allows for that event (RUN offers 1/2/3).
  const forged = scoringModule.apply(CRICKET, { ...baseInput, typeKey: "RUN", runs: 6 });
  assert.equal(forged.ok && forged.homeScore, 3, "runs are clamped to the nearest allowed value");

  const dot = scoringModule.apply(CRICKET, { ...baseInput, typeKey: "DOT_BALL" });
  assert.equal(dot.ok && dot.homeScore, 0, "a dot ball scores nothing");
});