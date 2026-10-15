import { test } from "node:test";
import assert from "node:assert/strict";
import type { GameCore, PlayerLine } from "@/lib/analytics/types";
import { buildPlayerDevelopmentPlan, buildSquadDevelopmentPlans, directionalPercentile, type PlayerMeta } from "./player-development";
import { positionGroup } from "./positions";
import { DRILLS } from "./drills";
import type { DevelopmentDimensionKey } from "./config";

type Stat = Partial<PlayerLine>;

function line(playerId: string, club: string, s: Stat): PlayerLine {
  return {
    playerId, name: playerId, jerseyNumber: null, photoUrl: null, seasonClubId: club, seasonClubShortName: club, side: "HOME",
    didNotPlay: false, minutesPlayed: 0, points: 8, rebounds: 4, assists: 2, steals: 1, blocks: 0, turnovers: 2, fouls: 2,
    fieldGoalsMade: 3, fieldGoalsAttempted: 7, twoPointsMade: 2, twoPointsAttempted: 4, threePointsMade: 1, threePointsAttempted: 3,
    freeThrowsMade: 2, freeThrowsAttempted: 3, offensiveRebounds: null, defensiveRebounds: null, foulsDrawn: null, plusMinus: null,
    efficiency: null, fourPointsMade: null, fourPointsAttempted: null, ultraTimePoints: null, ...s,
  };
}

// Builds `n` games; `players` gives each player's per-game line (same every game unless fn varies it).
function season(n: number, players: { id: string; club: string; stat: (g: number) => Stat }[]): GameCore[] {
  return Array.from({ length: n }, (_, g) => ({
    gameId: `g${g}`, fixtureId: `f${g}`, status: "FINAL", dataCapability: "BOX_SCORE_ONLY", divisionName: "Men",
    scheduledAt: new Date(Date.UTC(2026, 8, 1 + g)), home: {}, away: {}, periods: [],
    players: players.map((p) => line(p.id, p.club, p.stat(g))),
  })) as unknown as GameCore[];
}

const meta = (entries: [string, string][]) => new Map<string, PlayerMeta>(entries.map(([id, pos]) => [id, { position: pos, heightCm: null }]));

test("big with poor free throws gets FREE_THROWS as a focus area with a points-lost explanation", () => {
  const bigs = ["b1", "b2", "b3", "b4", "b5", "b6"];
  const games = season(8, bigs.map((id) => ({
    id, club: id === "b1" ? "A" : "B",
    stat: () => (id === "b1" ? { freeThrowsMade: 2, freeThrowsAttempted: 5 } : { freeThrowsMade: 7, freeThrowsAttempted: 10 }),
  })));
  const plan = buildPlayerDevelopmentPlan("b1", games, meta(bigs.map((b) => [b, "Center"])))!;
  assert.equal(plan.positionGroup, "BIG");
  const ft = plan.focusAreas[0];
  assert.equal(ft.dimension, "FREE_THROWS");
  assert.equal(ft.evidence.baseline.kind, "POSITION_PEERS");
  assert.equal(ft.evidence.playerValueLabel, "40.0%");
  assert.equal(ft.evidence.confidence, "HIGH"); // 40 FTA >= 2 x 10
  assert.match(ft.whyItMatters, /leaves about \d+\.\d points per game/);
  assert.equal(ft.target.target, 46); // +6 step, below the 70% peer median
  assert.equal(ft.drills.length, 3);
  assert.equal(ft.drills[0].level, "FOUNDATION"); // percentile < 20 starts with fundamentals
});

test("turnover-prone guard gets BALL_SECURITY; lower-is-better target goes down", () => {
  const guards = ["g1", "g2", "g3", "g4", "g5", "g6"];
  const games = season(6, guards.map((id) => ({ id, club: "A", stat: () => ({ turnovers: id === "g1" ? 6 : 2 }) })));
  const plan = buildPlayerDevelopmentPlan("g1", games, meta(guards.map((g) => [g, "PG"])))!;
  const bs = plan.focusAreas.find((f) => f.dimension === "BALL_SECURITY")!;
  assert.ok(bs, "expected a ball-security focus area");
  assert.ok(bs.target.target < bs.target.current);
  assert.match(bs.target.statement, /^Bring down turnovers per game from 6\.0 to 4\.5/);
});

test("small-sample bench player gets no recommendations", () => {
  const ids = ["p1", "p2", "p3", "p4", "p5", "bench"];
  const games = season(6, ids.map((id) => ({ id, club: "A", stat: () => ({}) })));
  for (const g of games.slice(2)) g.players = g.players.filter((p) => p.playerId !== "bench");
  const plan = buildPlayerDevelopmentPlan("bench", games, meta(ids.map((i) => [i, "SF"])))!;
  assert.equal(plan.gamesPlayed, 2);
  assert.equal(plan.status, "INSUFFICIENT_DATA");
  assert.equal(plan.focusAreas.length, 0);
  assert.ok(plan.readings.every((r) => r.status === "INSUFFICIENT_DATA"));
});

test("player equal to the league everywhere has no focus areas", () => {
  const ids = ["w1", "w2", "w3", "w4", "w5"];
  const games = season(6, ids.map((id) => ({ id, club: "A", stat: () => ({}) })));
  const plan = buildPlayerDevelopmentPlan("w1", games, meta(ids.map((i) => [i, "SF"])))!;
  assert.equal(plan.focusAreas.length, 0);
  assert.equal(plan.strengths.length, 0);
});

test("four-point dimension without data is INSUFFICIENT_DATA, never a weakness", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const plan = buildPlayerDevelopmentPlan("a", season(6, ids.map((id) => ({ id, club: "A", stat: () => ({}) }))), meta(ids.map((i) => [i, "SG"])))!;
  const four = plan.readings.find((r) => r.dimension === "FOUR_POINT")!;
  assert.equal(four.status, "INSUFFICIENT_DATA");
});

test("falls back to a league baseline when the position group is too small", () => {
  const ids = ["g1", "g2", "w1", "w2", "w3", "w4"];
  const m = meta([["g1", "PG"], ["g2", "SG"], ["w1", "SF"], ["w2", "SF"], ["w3", "SF"], ["w4", "SF"]]);
  const games = season(6, ids.map((id) => ({ id, club: "A", stat: () => ({ assists: id === "g1" ? 0 : 3 }) })));
  const plan = buildPlayerDevelopmentPlan("g1", games, m)!;
  const pm = plan.readings.find((r) => r.dimension === "PLAYMAKING")!;
  assert.equal(pm.status, "OK");
  if (pm.status === "OK") assert.equal(pm.evidence.baseline.kind, "LEAGUE");
});

test("declining trend is detected over the last 5 games", () => {
  const ids = ["r1", "r2", "r3", "r4", "r5"];
  const games = season(10, ids.map((id) => ({ id, club: "A", stat: (g: number) => ({ rebounds: id === "r1" ? (g < 5 ? 6 : 1) : 4 }) })));
  const plan = buildPlayerDevelopmentPlan("r1", games, meta(ids.map((i) => [i, "PF"])))!;
  const reb = plan.readings.find((r) => r.dimension === "REBOUNDING")!;
  assert.equal(reb.status, "OK");
  if (reb.status === "OK") assert.equal(reb.trend.direction, "DECLINING");
});

test("squad plans include only the club's players", () => {
  const ids = ["a1", "a2", "b1"];
  const games = season(5, ids.map((id) => ({ id, club: id.startsWith("a") ? "A" : "B", stat: () => ({}) })));
  assert.deepEqual(buildSquadDevelopmentPlans(games, "A", meta([])).map((p) => p.playerId).sort(), ["a1", "a2"]);
});

test("directionalPercentile uses mid-rank ties and respects direction", () => {
  assert.equal(directionalPercentile(5, [5, 5, 5, 5], "HIGHER_IS_BETTER"), 50);
  assert.equal(directionalPercentile(1, [1, 2, 3, 4], "HIGHER_IS_BETTER"), 13);
  assert.equal(directionalPercentile(1, [1, 2, 3, 4], "LOWER_IS_BETTER"), 88);
});

test("positionGroup maps free-text positions", () => {
  assert.equal(positionGroup("PG"), "GUARD");
  assert.equal(positionGroup("Shooting Guard"), "GUARD");
  assert.equal(positionGroup("power forward"), "BIG");
  assert.equal(positionGroup("CENTER"), "BIG");
  assert.equal(positionGroup("Small Forward"), "WING");
  assert.equal(positionGroup("SG/SF"), "GUARD");
  assert.equal(positionGroup(""), "UNKNOWN");
  assert.equal(positionGroup(null), "UNKNOWN");
});

test("drill registry: unique ids and at least 3 drills per dimension", () => {
  assert.equal(new Set(DRILLS.map((d) => d.id)).size, DRILLS.length);
  const dims: DevelopmentDimensionKey[] = ["SCORING_EFFICIENCY", "FREE_THROWS", "THREE_POINT", "FOUR_POINT", "PLAYMAKING", "BALL_SECURITY", "REBOUNDING", "DEFENSIVE_ACTIVITY", "FOUL_DISCIPLINE"];
  for (const d of dims) assert.ok(DRILLS.filter((x) => x.dimension === d).length >= 3, d);
});
