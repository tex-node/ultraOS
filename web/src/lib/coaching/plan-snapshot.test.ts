import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachingPlanSnapshot, COACHING_PLAN_SNAPSHOT_VERSION, isAdoptablePlan, parseCoachingPlanSnapshot } from "./plan-snapshot";
import type { FocusArea, PlayerDevelopmentPlan } from "./player-development";

function focusArea(overrides: Partial<FocusArea> = {}): FocusArea {
  return {
    dimension: "FREE_THROWS",
    label: "Free-throw shooting",
    priority: 1,
    evidence: {
      metric: "Free-throw %",
      playerValue: 0.61,
      playerValueLabel: "61%",
      baseline: { kind: "POSITION_PEERS", label: "Point guard peers", peerCount: 12, median: 0.7, medianLabel: "70%" },
      percentile: 22,
      sample: { games: 8, attempts: 44, label: "44 free-throw attempts in 8 games" },
      gate: "at least 20 attempts",
      confidence: "MEDIUM",
      source: "BOX_SCORE",
    },
    trend: { direction: "IMPROVING", recentValueLabel: "64%", recentGames: 3 },
    whyItMatters: "Free throws are the cheapest points on the board.",
    target: {
      metricKey: "game.ft_pct",
      metric: "Free-throw %",
      current: 0.61,
      target: 0.72,
      currentLabel: "61%",
      targetLabel: "72%",
      reviewWindowGames: 6,
      statement: "Make 72% of free throws over the next 6 games.",
    },
    drills: [
      { id: "ft_routine", name: "Free-throw routine", durationMinutes: 10 } as FocusArea["drills"][number],
      { id: "ft_pressure", name: "Pressure free throws", durationMinutes: 15 } as FocusArea["drills"][number],
    ],
    ...overrides,
  };
}

function plan(overrides: Partial<PlayerDevelopmentPlan> = {}): PlayerDevelopmentPlan {
  return {
    playerId: "player-1",
    name: "P One",
    jerseyNumber: 7,
    seasonClubId: "sc-1",
    position: "Point guard",
    positionGroup: "GUARD",
    gamesPlayed: 8,
    status: "OK",
    focusAreas: [focusArea()],
    strengths: [{ dimension: "PLAYMAKING", label: "Playmaking", evidence: focusArea().evidence, note: "Elite assist rate." }],
    readings: [],
    ...overrides,
  };
}

test("buildCoachingPlanSnapshot keeps the actionable parts and stamps the engine version", () => {
  const snapshot = buildCoachingPlanSnapshot(plan());
  assert.equal(snapshot.version, COACHING_PLAN_SNAPSHOT_VERSION);
  assert.equal(snapshot.playerId, "player-1");
  assert.equal(snapshot.seasonClubId, "sc-1");
  assert.equal(snapshot.status, "OK");
  assert.equal(snapshot.reviewWindowGames, 6);
  assert.deepEqual(snapshot.strengths, [{ dimension: "PLAYMAKING", label: "Playmaking" }]);

  const [area] = snapshot.focusAreas;
  assert.equal(area.dimension, "FREE_THROWS");
  assert.equal(area.metricKey, "game.ft_pct");
  assert.equal(area.target.value, 0.72);
  assert.equal(area.target.reviewWindowGames, 6);
  assert.equal(area.current.value, 0.61);
  assert.equal(area.evidence.baselineKind, "POSITION_PEERS");
  assert.equal(area.evidence.peerCount, 12);
  assert.deepEqual(area.drills, [
    { id: "ft_routine", name: "Free-throw routine", durationMinutes: 10 },
    { id: "ft_pressure", name: "Pressure free throws", durationMinutes: 15 },
  ]);
  // The large, re-derivable parts stay out of the row: drill bodies and the full evidence object.
  assert.equal("whyItMatters" in area, false);
  assert.equal("description" in (area.drills[0] as Record<string, unknown>), false);
});

test("buildCoachingPlanSnapshot takes the widest review window rather than the first area's", () => {
  const snapshot = buildCoachingPlanSnapshot(
    plan({
      focusAreas: [
        focusArea({ priority: 1 }),
        focusArea({
          dimension: "BALL_SECURITY",
          label: "Ball security",
          priority: 2,
          target: { ...focusArea().target, metricKey: "game.tov_pg", reviewWindowGames: 10 },
        }),
      ],
    }),
  );
  assert.equal(snapshot.reviewWindowGames, 10);
  assert.equal(snapshot.focusAreas.length, 2);
  assert.equal(snapshot.focusAreas[1].metricKey, "game.tov_pg");
});

test("isAdoptablePlan refuses a plan with no recommendations or with insufficient data", () => {
  assert.equal(isAdoptablePlan(plan()), true);
  assert.equal(isAdoptablePlan(null), false);
  assert.equal(isAdoptablePlan(undefined), false);
  assert.equal(isAdoptablePlan(plan({ status: "INSUFFICIENT_DATA", focusAreas: [] })), false);
  assert.equal(isAdoptablePlan(plan({ status: "OK", focusAreas: [] })), false, "no focus areas means nothing to adopt, even if the status says OK");
});

test("parseCoachingPlanSnapshot round-trips its own output and rejects garbage rather than throwing", () => {
  const snapshot = buildCoachingPlanSnapshot(plan());
  assert.deepEqual(parseCoachingPlanSnapshot(JSON.parse(JSON.stringify(snapshot))), snapshot);

  assert.equal(parseCoachingPlanSnapshot(null), null);
  assert.equal(parseCoachingPlanSnapshot("nope"), null);
  assert.equal(parseCoachingPlanSnapshot({}), null, "a row without a version is not a snapshot this code understands");
  assert.equal(parseCoachingPlanSnapshot({ version: "c1-1", focusAreas: "not-an-array" }), null);

  // A future/partial row with one bad focus area keeps the good ones instead of failing entirely.
  const partial = parseCoachingPlanSnapshot({
    version: "c1-1",
    focusAreas: [snapshot.focusAreas[0], { dimension: "NO_TARGET" }, null],
    reviewWindowGames: 6,
  });
  assert.equal(partial?.focusAreas.length, 1);
  assert.equal(partial?.status, "INSUFFICIENT_DATA", "an absent status must not be reported as OK");
});
