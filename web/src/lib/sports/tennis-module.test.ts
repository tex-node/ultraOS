import assert from "node:assert/strict";
import test from "node:test";
import { resolveScoringModule, type ScoringModuleInput, type ScoringModuleResult } from "@/lib/sports/scoring-modules";
import { TENNIS } from "@/lib/sports/tennis";

const tennisScoring = resolveScoringModule(TENNIS);

test("tennis resolves to the tennis scoring module", () => {
  assert.equal(tennisScoring?.kind, "TENNIS");
});

function point(input: ScoringModuleInput): Extract<ScoringModuleResult, { ok: true }> {
  const result = tennisScoring!.apply(TENNIS, input);
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result as Extract<ScoringModuleResult, { ok: true }>;
}

test("four points with a two-point lead wins a game and resets points", () => {
  let input: ScoringModuleInput = {
    homeSeasonClubId: "e-a",
    awaySeasonClubId: "e-b",
    currentPeriod: 1,
    homeScore: 0,
    awayScore: 0,
    periodScores: [],
    seasonClubId: "e-a",
    typeKey: "POINT",
    tennisPoints: { home: 0, away: 0 },
  };

  let last = point(input);
  assert.deepEqual(last.tennisPoints, { home: 1, away: 0 });

  input = { ...input, periodScores: last.period ? [last.period] : [], tennisPoints: last.tennisPoints };
  last = point(input);
  input = { ...input, tennisPoints: last.tennisPoints };
  last = point(input);
  assert.deepEqual(last.tennisPoints, { home: 3, away: 0 });

  input = { ...input, tennisPoints: last.tennisPoints };
  last = point(input); // 4th point -> game won
  assert.deepEqual(last.period, { period: 1, home: 1, away: 0 });
  assert.deepEqual(last.tennisPoints, { home: 0, away: 0 });
  assert.equal(last.finalize, false);
});

test("rejects a point attributed to a non-party", () => {
  const result = tennisScoring!.apply(TENNIS, {
    homeSeasonClubId: "e-a",
    awaySeasonClubId: "e-b",
    currentPeriod: 1,
    homeScore: 0,
    awayScore: 0,
    periodScores: [],
    seasonClubId: "someone-else",
    typeKey: "POINT",
  });
  assert.equal(result.ok, false);
});
