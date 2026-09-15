import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { CRICKET } from "@/lib/sports/cricket";
import { FOOTBALL } from "@/lib/sports/football";
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
  assert.equal(resolveScoringModule(BASKETBALL), null); // basketball keeps its dedicated scorer
  assert.deepEqual(SCORING_MODULES.map((module) => module.kind), ["SETS", "GOALS", "RUNS"]);
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
