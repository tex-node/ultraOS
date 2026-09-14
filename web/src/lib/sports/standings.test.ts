import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { CRICKET } from "@/lib/sports/cricket";
import { FOOTBALL } from "@/lib/sports/football";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import { computeStandings } from "@/lib/sports/standings";
import { calculateStandings, compareStandings } from "@/lib/standings";

test("basketball standings are parity-equal to the legacy engine", () => {
  const teams = [
    { entrantId: "apex", name: "Apex" },
    { entrantId: "volt", name: "Volt" },
    { entrantId: "flux", name: "Flux" },
  ];
  const results = [
    { homeEntrantId: "apex", awayEntrantId: "volt", homeScore: 90, awayScore: 80 },
    { homeEntrantId: "flux", awayEntrantId: "apex", homeScore: 70, awayScore: 75 },
    { homeEntrantId: "volt", awayEntrantId: "flux", homeScore: 88, awayScore: 88 },
  ];

  const generic = computeStandings(BASKETBALL, teams, results);
  const legacy = calculateStandings(
    teams.map((team) => team.entrantId),
    results.map((result) => ({
      homeSeasonClubId: result.homeEntrantId,
      awaySeasonClubId: result.awayEntrantId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winnerSeasonClubId:
        result.homeScore > result.awayScore
          ? result.homeEntrantId
          : result.awayScore > result.homeScore
            ? result.awayEntrantId
            : null,
    })),
  );

  for (const row of generic) {
    const expected = legacy.get(row.entrantId);
    assert.ok(expected);
    assert.equal(row.played, expected.played);
    assert.equal(row.won, expected.won);
    assert.equal(row.lost, expected.lost);
    assert.equal(row.pointsFor, expected.pointsFor);
    assert.equal(row.pointsAgainst, expected.pointsAgainst);
    assert.equal(row.pointDifference, expected.pointDifference);
    assert.equal(row.leaguePoints, expected.leaguePoints);
  }

  const legacySorted = teams
    .map((team) => ({ name: team.name, ...legacy.get(team.entrantId)! }))
    .sort(compareStandings);
  assert.deepEqual(
    generic.map((row) => row.name),
    legacySorted.map((row) => row.name),
  );
  assert.deepEqual(
    generic.map((row) => row.rank),
    [1, 2, 3],
  );
});

test("football records draws and awards draw points", () => {
  const rows = computeStandings(
    FOOTBALL,
    [
      { entrantId: "a", name: "Alpha" },
      { entrantId: "b", name: "Beta" },
    ],
    [
      { homeEntrantId: "a", awayEntrantId: "b", homeScore: 2, awayScore: 1 },
      { homeEntrantId: "b", awayEntrantId: "a", homeScore: 0, awayScore: 0 },
    ],
  );
  const a = rows.find((row) => row.entrantId === "a")!;
  const b = rows.find((row) => row.entrantId === "b")!;
  assert.equal(a.won, 1);
  assert.equal(a.drawn, 1);
  assert.equal(a.leaguePoints, 4);
  assert.equal(b.drawn, 1);
  assert.equal(b.leaguePoints, 1);
});

test("volleyball awards match points by set score and computes set ratio", () => {
  const rows = computeStandings(
    VOLLEYBALL,
    [
      { entrantId: "a", name: "Alpha" },
      { entrantId: "b", name: "Beta" },
    ],
    [
      {
        homeEntrantId: "a",
        awayEntrantId: "b",
        homeScore: 3,
        awayScore: 0,
        secondary: {
          home: { SETS_WON: 3, SETS_LOST: 0, POINTS_WON: 75, POINTS_LOST: 50 },
          away: { SETS_WON: 0, SETS_LOST: 3, POINTS_WON: 50, POINTS_LOST: 75 },
        },
      },
      {
        homeEntrantId: "b",
        awayEntrantId: "a",
        homeScore: 3,
        awayScore: 2,
        secondary: {
          home: { SETS_WON: 3, SETS_LOST: 2, POINTS_WON: 100, POINTS_LOST: 95 },
          away: { SETS_WON: 2, SETS_LOST: 3, POINTS_WON: 95, POINTS_LOST: 100 },
        },
      },
    ],
  );
  const a = rows.find((row) => row.entrantId === "a")!;
  const b = rows.find((row) => row.entrantId === "b")!;
  assert.equal(a.leaguePoints, 4); // 3 (sweep) + 1 (five-set loss)
  assert.equal(b.leaguePoints, 2); // 0 + 2 (five-set win)
  assert.ok(Math.abs((a.secondary.SET_RATIO ?? 0) - 5 / 3) < 1e-9);
});

test("cricket awards points and computes net run rate", () => {
  const rows = computeStandings(
    CRICKET,
    [
      { entrantId: "a", name: "Alpha" },
      { entrantId: "b", name: "Beta" },
    ],
    [
      {
        homeEntrantId: "a",
        awayEntrantId: "b",
        homeScore: 180,
        awayScore: 150,
        outcome: "HOME_WIN",
        secondary: {
          home: { RUNS_FOR: 180, OVERS_FACED: 20, RUNS_AGAINST: 150, OVERS_BOWLED: 20 },
          away: { RUNS_FOR: 150, OVERS_FACED: 20, RUNS_AGAINST: 180, OVERS_BOWLED: 20 },
        },
      },
    ],
  );
  const a = rows.find((row) => row.entrantId === "a")!;
  const b = rows.find((row) => row.entrantId === "b")!;
  assert.equal(a.leaguePoints, 2);
  assert.equal(b.leaguePoints, 0);
  assert.ok(Math.abs((a.secondary.NET_RUN_RATE ?? 0) - 1.5) < 1e-9);
});

test("rankTiebreak records the deciding key below the leader", () => {
  const rows = computeStandings(
    BASKETBALL,
    [
      { entrantId: "a", name: "Alpha" },
      { entrantId: "b", name: "Beta" },
    ],
    [{ homeEntrantId: "a", awayEntrantId: "b", homeScore: 80, awayScore: 70 }],
  );
  assert.equal(rows[0].rankTiebreak, null);
  assert.equal(rows[1].rankTiebreak, "LEAGUE_POINTS");
});
