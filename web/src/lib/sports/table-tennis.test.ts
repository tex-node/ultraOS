import assert from "node:assert/strict";
import test from "node:test";
import { TABLE_TENNIS } from "@/lib/sports/table-tennis";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import { getSportDefinition } from "@/lib/sports/registry";
import { resolveScoringModule } from "@/lib/sports/scoring-modules";

const baseInput = {
  homeSeasonClubId: "h",
  awaySeasonClubId: "a",
  currentPeriod: 1,
  homeScore: 0,
  awayScore: 0,
  periodScores: [] as { period: number; home: number; away: number }[],
  seasonClubId: "h",
};

test("registered as an individual sport", () => {
  assert.equal(getSportDefinition("TABLE_TENNIS")?.slug, "table-tennis");
  assert.deepEqual(TABLE_TENNIS.entities, ["INDIVIDUAL"]);
});

test("games to 11, win by 2, best of five, no clock", () => {
  assert.equal(TABLE_TENNIS.structure.periodType, "SET");
  assert.equal(TABLE_TENNIS.structure.pointsToWinPeriod, 11);
  assert.equal(TABLE_TENNIS.structure.periodsToWin, 3);
  assert.equal(TABLE_TENNIS.structure.clock, "NONE");
  assert.equal(TABLE_TENNIS.scoring.drawsAllowed, false);
});

test("the SETS module claims it with table-tennis buttons, not volleyball ones", () => {
  const scoringModule = resolveScoringModule(TABLE_TENNIS)!;
  assert.equal(scoringModule.key, "VOLLEYBALL_SETS");
  assert.equal(scoringModule.kind, "SETS");
  const labels = scoringModule.actions(TABLE_TENNIS).map((action) => action.typeKey);
  assert.ok(labels.includes("TABLE_POINT"));
  assert.ok(labels.includes("FOREHAND_WINNER"));
  assert.equal(labels.includes("KILL"), false);
  assert.equal(labels.includes("RALLY_POINT"), false);
});

test("volleyball keeps its own buttons", () => {
  const scoringModule = resolveScoringModule(TABLE_TENNIS)!;
  assert.deepEqual(
    scoringModule.actions(VOLLEYBALL).map((action) => action.typeKey),
    ["RALLY_POINT", "ACE", "KILL", "BLOCK", "DUMP"],
  );
});

test("eleven straight points win the game by two but not the match", () => {
  const scoringModule = resolveScoringModule(TABLE_TENNIS)!;
  let periodScores: { period: number; home: number; away: number }[] = [];
  let result: ReturnType<typeof scoringModule.apply> = {
    ok: true,
    homeScore: 0,
    awayScore: 0,
    period: null,
    points: null,
    typeKey: "TABLE_POINT",
    eventKind: "SCORE",
    finalize: false,
    finalizeWinner: null,
  };
  for (let i = 0; i < 11; i += 1) {
    result = scoringModule.apply(TABLE_TENNIS, {
      ...baseInput,
      homeScore: 0,
      awayScore: 0,
      periodScores,
      typeKey: "TABLE_POINT",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    if (result.period) {
      const period = result.period;
      periodScores = [...periodScores.filter((s) => s.period !== period.period), period];
    }
  }
  assert.deepEqual(periodScores, [{ period: 1, home: 11, away: 0 }]);
  assert.equal(result.homeScore, 1); // one game won
  assert.equal(result.finalize, false); // best of five needs three
});

test("binary standings: match points, then head-to-head, sets, points", () => {
  assert.deepEqual(TABLE_TENNIS.standings.outcomes, ["WIN", "LOSS"]);
  assert.deepEqual(TABLE_TENNIS.standings.tiebreak.slice(0, 4), ["LEAGUE_POINTS", "HEAD_TO_HEAD", "SET_RATIO", "POINT_RATIO"]);
});

test("every metric references a real event", () => {
  const keys = new Set(TABLE_TENNIS.events.map((e) => e.key));
  for (const metric of TABLE_TENNIS.metrics) {
    for (const eventKey of metric.derivedFromEventKeys ?? []) {
      assert.ok(keys.has(eventKey), `${metric.key} references unknown event ${eventKey}`);
    }
  }
});