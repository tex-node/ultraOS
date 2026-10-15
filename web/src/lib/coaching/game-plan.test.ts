import { test } from "node:test";
import assert from "node:assert/strict";
import type { GameCore, PlayerLine, TeamSideStats } from "@/lib/analytics/types";
import { buildGamePlan, buildGamePlanReview } from "./game-plan";
import type { PlayerMeta } from "./player-development";

type TeamSpec = {
  id: string;
  side?: Partial<TeamSideStats>;
  players: { id: string; stat?: Partial<PlayerLine> }[];
  periods?: [number, number]; // [first-half points, second-half points]
};

function pline(id: string, club: string, s: Partial<PlayerLine> = {}): PlayerLine {
  return {
    playerId: id, name: id, jerseyNumber: null, photoUrl: null, seasonClubId: club, seasonClubShortName: club, side: "HOME", didNotPlay: false,
    minutesPlayed: 0, points: 10, rebounds: 4, assists: 2, steals: 1, blocks: 0, turnovers: 2, fouls: 2,
    fieldGoalsMade: 4, fieldGoalsAttempted: 9, twoPointsMade: 3, twoPointsAttempted: 6, threePointsMade: 1, threePointsAttempted: 3,
    freeThrowsMade: 3, freeThrowsAttempted: 4, offensiveRebounds: 1, defensiveRebounds: 3, foulsDrawn: null, plusMinus: null, efficiency: null,
    fourPointsMade: null, fourPointsAttempted: null, ultraTimePoints: null, ...s,
  };
}

function side(t: TeamSpec): TeamSideStats {
  const pts = t.players.reduce((s, p) => s + (p.stat?.points ?? 10), 0);
  return {
    seasonClubId: t.id, shortName: t.id, name: t.id, logoUrl: null, primaryColor: null, score: pts, rebounds: 20, assists: 10, turnovers: 10, fouls: 12,
    fieldGoalsMade: 20, fieldGoalsAttempted: 50, twoPointsMade: 15, twoPointsAttempted: 35, threePointsMade: 5, threePointsAttempted: 15,
    freeThrowsMade: 5, freeThrowsAttempted: 10, offensiveRebounds: 6, defensiveRebounds: 14, pointsFromTurnovers: null, pointsInPaint: null,
    pointsInPaintMade: null, pointsInPaintAttempted: null, secondChancePoints: null, fastBreakPoints: null, fastBreakPointsFromTurnovers: null,
    benchPoints: null, biggestLead: null, biggestScoringRun: null, pointsPerPossession: null, leadChanges: null, timesTied: null,
    timeWithLeadSeconds: null, fourPointsMade: null, fourPointsAttempted: null, ultraTimePointsFor: null, ultraTimePointsAgainst: null,
    ...t.side,
  };
}

let day = 0;
function game(h: TeamSpec, a: TeamSpec): GameCore {
  const home = side(h);
  const away = side(a);
  const hp = h.periods ?? [Math.floor(home.score / 2), home.score - Math.floor(home.score / 2)];
  const ap = a.periods ?? [Math.floor(away.score / 2), away.score - Math.floor(away.score / 2)];
  day += 1;
  return {
    gameId: `g${day}`, fixtureId: `f${day}`, status: "FINAL", dataCapability: "BOX_SCORE_ONLY", divisionName: "Men", scheduledAt: new Date(Date.UTC(2026, 8, day)),
    home, away,
    players: [...h.players.map((p) => pline(p.id, h.id, p.stat)), ...a.players.map((p) => pline(p.id, a.id, p.stat))],
    periods: [
      { period: 1, label: "H1", homeScore: hp[0], awayScore: ap[0] },
      { period: 2, label: "H2", homeScore: hp[1], awayScore: ap[1] },
    ],
  } as GameCore;
}

// Round robin, `rounds` times: every team plays every other team once per round.
function league(teams: TeamSpec[], rounds: number): GameCore[] {
  const out: GameCore[] = [];
  for (let r = 0; r < rounds; r++) for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) out.push(game(teams[i], teams[j]));
  return out;
}

const plain = (id: string): TeamSpec => ({ id, players: [1, 2, 3, 4, 5].map((n) => ({ id: `${id}${n}` })) });
const noMeta = new Map<string, PlayerMeta>();

test("finds the focal point, a poor FT shooter and a turnover-prone opponent", () => {
  const opp: TeamSpec = {
    id: "B",
    side: { turnovers: 16 },
    players: [
      { id: "star", stat: { points: 22 } },
      { id: "bigFT", stat: { freeThrowsMade: 2, freeThrowsAttempted: 6 } },
      { id: "B3" }, { id: "B4" }, { id: "B5", stat: { points: 4 } },
    ],
  };
  const games = league([plain("A"), opp, plain("C"), plain("D")], 2);
  const plan = buildGamePlan(games, "A", "B", noMeta)!;
  assert.equal(plan.status, "OK");
  const kinds = plan.keys.map((k) => k.kind);
  assert.ok(kinds.includes("DENY_FOCAL_POINT"), kinds.join());
  assert.ok(kinds.includes("FOUL_POOR_FT_SHOOTER"), kinds.join());
  assert.ok(kinds.includes("PRESSURE_THE_BALL"), kinds.join());
  const deny = plan.keys.find((k) => k.kind === "DENY_FOCAL_POINT")!;
  assert.equal(deny.subject?.playerId, "star");
  assert.equal(deny.check.side, "OPPONENT");
  assert.ok(plan.keys.every((k) => k.evidence.length > 0));
  assert.equal(plan.headToHead.games, 2);
});

test("an average opponent produces no keys and an average focus team gives them none either", () => {
  const plan = buildGamePlan(league([plain("A"), plain("B"), plain("C"), plain("D")], 2), "A", "B", noMeta)!;
  assert.equal(plan.status, "OK");
  assert.deepEqual(plan.keys, []);
  assert.deepEqual(plan.howTheyBeatUs, []);
});

test("how they beat us runs the rules from the opponent's side", () => {
  const focus: TeamSpec = { ...plain("A"), side: { turnovers: 17 } };
  const plan = buildGamePlan(league([focus, plain("B"), plain("C"), plain("D")], 2), "A", "B", noMeta)!;
  const press = plan.howTheyBeatUs.find((k) => k.kind === "PRESSURE_THE_BALL");
  assert.ok(press, "opponent should be told to pressure our ball handlers");
  assert.equal(press!.check.side, "FOCUS");
});

test("too few games gives INSUFFICIENT_DATA with a reason", () => {
  const games = league([plain("A"), plain("B"), plain("C")], 1); // each team plays 2 games
  const plan = buildGamePlan(games, "A", "B", noMeta)!;
  assert.equal(plan.status, "INSUFFICIENT_DATA");
  assert.match(plan.insufficientReason!, /needs 3/);
  assert.equal(plan.keys.length, 0);
});

test("assignments use each defender once and prefer the same position group", () => {
  const meta = new Map<string, PlayerMeta>([
    ["B1", { position: "PG", heightCm: 180 }], ["B2", { position: "C", heightCm: 205 }], ["B3", { position: "SF", heightCm: 195 }],
    ["A1", { position: "PG", heightCm: 182 }], ["A2", { position: "C", heightCm: 206 }], ["A3", { position: "SF", heightCm: 194 }],
    ["A4", { position: "PG", heightCm: 178 }], ["A5", { position: "PF", heightCm: 200 }],
  ]);
  const opp: TeamSpec = { id: "B", players: [{ id: "B1", stat: { points: 20 } }, { id: "B2", stat: { points: 16 } }, { id: "B3", stat: { points: 12 } }, { id: "B4", stat: { points: 2 } }, { id: "B5", stat: { points: 2 } }] };
  const plan = buildGamePlan(league([plain("A"), opp, plain("C"), plain("D")], 2), "A", "B", meta)!;
  assert.equal(plan.assignments.length, 3);
  const pairs = plan.assignments.map((a) => [a.threat.playerId, a.defender?.playerId]);
  assert.deepEqual(pairs, [["B1", "A1"], ["B2", "A2"], ["B3", "A3"]]);
  assert.equal(new Set(pairs.map((p) => p[1])).size, 3);
});

test("late game names the best qualified FT shooter and flags missing Ultra Time data", () => {
  const focus: TeamSpec = { id: "A", players: [{ id: "A1", stat: { freeThrowsMade: 5, freeThrowsAttempted: 6 } }, { id: "A2", stat: { freeThrowsMade: 3, freeThrowsAttempted: 6 } }, { id: "A3" }, { id: "A4" }, { id: "A5" }] };
  const plan = buildGamePlan(league([focus, plain("B"), plain("C"), plain("D")], 2), "A", "B", noMeta)!;
  const ft = plan.lateGame!.closers.find((c) => c.role === "FREE_THROWS")!;
  assert.equal(ft.player.playerId, "A1");
  assert.equal(plan.lateGame!.ultraTimeDataAvailable, false);
  assert.ok(plan.lateGame!.notes.some((n) => /No Ultra Time data/.test(n)));
});

test("a high-volume, accurate three-point team triggers RUN_THEM_OFF_THE_LINE only when above the league rate", () => {
  const opp: TeamSpec = { ...plain("B"), side: { threePointsAttempted: 25, threePointsMade: 10, fieldGoalsAttempted: 50 } };
  const plan = buildGamePlan(league([plain("A"), opp, plain("C"), plain("D")], 2), "A", "B", noMeta)!;
  assert.ok(plan.keys.some((k) => k.kind === "RUN_THEM_OFF_THE_LINE"), plan.keys.map((k) => k.kind).join());
});

test("a team that fades late triggers WIN_THE_SECOND_HALF", () => {
  const opp: TeamSpec = { ...plain("B"), periods: [35, 15] };
  const plan = buildGamePlan(league([plain("A"), opp, plain("C"), plain("D")], 2), "A", "B", noMeta)!;
  assert.ok(plan.keys.some((k) => k.kind === "WIN_THE_SECOND_HALF"), plan.keys.map((k) => k.kind).join());
});

test("post-game review marks keys HELD, BROKEN or NOT_TESTABLE", () => {
  const opp: TeamSpec = { id: "B", side: { turnovers: 16 }, players: [{ id: "star", stat: { points: 22 } }, { id: "B2" }, { id: "B3" }, { id: "B4" }, { id: "B5", stat: { points: 4 } }] };
  const teams = [plain("A"), opp, plain("C"), plain("D")];
  const plan = buildGamePlan(league(teams, 2), "A", "B", noMeta)!;
  const held = game(plain("A"), { ...opp, side: { turnovers: 20 }, players: [{ id: "star", stat: { points: 8 } }, ...opp.players.slice(1)] });
  const review = buildGamePlanReview(plan, held);
  assert.equal(review.find((r) => r.key.kind === "DENY_FOCAL_POINT")!.verdict, "HELD");
  assert.equal(review.find((r) => r.key.kind === "PRESSURE_THE_BALL")!.verdict, "HELD");
  const broken = game(plain("A"), { ...opp, side: { turnovers: 5 }, players: [{ id: "star", stat: { points: 30 } }, ...opp.players.slice(1)] });
  const r2 = buildGamePlanReview(plan, broken);
  assert.equal(r2.find((r) => r.key.kind === "DENY_FOCAL_POINT")!.verdict, "BROKEN");
  const absent = game(plain("A"), { ...opp, players: opp.players.slice(1) });
  assert.equal(buildGamePlanReview(plan, absent).find((r) => r.key.kind === "DENY_FOCAL_POINT")!.verdict, "NOT_TESTABLE");
});
