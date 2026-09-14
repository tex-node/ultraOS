import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import { TENNIS } from "@/lib/sports/tennis";
import { VOLLEYBALL } from "@/lib/sports/volleyball";
import { computeSeasonStandings } from "@/lib/sports/standings";
import { calculateStandings } from "@/lib/standings";

test("volleyball season standings award match points by set score", () => {
  const teams = [
    { seasonClubId: "a", name: "Alpha", entrantId: "e-a" },
    { seasonClubId: "b", name: "Beta", entrantId: "e-b" },
    { seasonClubId: "c", name: "Gamma", entrantId: "e-c" },
  ];
  // Fixture scores are SETS WON.
  const fixtures = [
    { homeSeasonClubId: "a", awaySeasonClubId: "b", homeScore: 3, awayScore: 0 },
    { homeSeasonClubId: "b", awaySeasonClubId: "c", homeScore: 3, awayScore: 2 },
    { homeSeasonClubId: "a", awaySeasonClubId: "c", homeScore: 3, awayScore: 1 },
  ];

  const rows = computeSeasonStandings(VOLLEYBALL, teams, fixtures);
  const byId = new Map(rows.map((row) => [row.seasonClubId, row]));

  assert.equal(byId.get("a")!.leaguePoints, 6); // two sweeps
  assert.equal(byId.get("b")!.leaguePoints, 2); // five-set win
  assert.equal(byId.get("c")!.leaguePoints, 1); // five-set loss
  assert.deepEqual(
    rows.map((row) => row.seasonClubId),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    rows.map((row) => row.rank),
    [1, 2, 3],
  );
  assert.equal(byId.get("a")!.entrantId, "e-a");
  assert.ok(Math.abs((byId.get("a")!.secondary.SET_RATIO ?? 0) - 6) < 1e-9);
});

test("tennis season standings use wins and set ratio", () => {
  const teams = [
    { seasonClubId: "a", name: "Alpha", entrantId: "e-a" },
    { seasonClubId: "b", name: "Beta", entrantId: "e-b" },
  ];
  // Fixture scores are SETS WON (best-of-three).
  const fixtures = [
    { homeSeasonClubId: "a", awaySeasonClubId: "b", homeScore: 2, awayScore: 0 },
    { homeSeasonClubId: "b", awaySeasonClubId: "a", homeScore: 2, awayScore: 1 },
  ];

  const rows = computeSeasonStandings(TENNIS, teams, fixtures);
  const byId = new Map(rows.map((row) => [row.seasonClubId, row]));
  assert.equal(byId.get("a")!.leaguePoints, 1);
  assert.equal(byId.get("b")!.leaguePoints, 1);
  // Set ratio breaks the tie: a 3-2, b 2-3.
  assert.equal(rows[0].seasonClubId, "a");
  assert.ok(Math.abs((byId.get("a")!.secondary.SET_RATIO ?? 0) - 1.5) < 1e-9);
});

test("basketball season standings are parity-equal to the legacy engine", () => {
  const teams = [
    { seasonClubId: "apex", name: "Apex", entrantId: null },
    { seasonClubId: "volt", name: "Volt", entrantId: null },
    { seasonClubId: "flux", name: "Flux", entrantId: null },
  ];
  const fixtures = [
    { homeSeasonClubId: "apex", awaySeasonClubId: "volt", homeScore: 90, awayScore: 80 },
    { homeSeasonClubId: "flux", awaySeasonClubId: "apex", homeScore: 70, awayScore: 75 },
    { homeSeasonClubId: "volt", awaySeasonClubId: "flux", homeScore: 88, awayScore: 88 },
  ];

  const computed = computeSeasonStandings(BASKETBALL, teams, fixtures);
  const legacy = calculateStandings(
    teams.map((team) => team.seasonClubId),
    fixtures.map((fixture) => ({
      homeSeasonClubId: fixture.homeSeasonClubId,
      awaySeasonClubId: fixture.awaySeasonClubId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      winnerSeasonClubId:
        fixture.homeScore > fixture.awayScore
          ? fixture.homeSeasonClubId
          : fixture.awayScore > fixture.homeScore
            ? fixture.awaySeasonClubId
            : null,
    })),
  );

  for (const row of computed) {
    const expected = legacy.get(row.seasonClubId)!;
    assert.equal(row.played, expected.played);
    assert.equal(row.won, expected.won);
    assert.equal(row.lost, expected.lost);
    assert.equal(row.pointsFor, expected.pointsFor);
    assert.equal(row.pointsAgainst, expected.pointsAgainst);
    assert.equal(row.pointDifference, expected.pointDifference);
    assert.equal(row.leaguePoints, expected.leaguePoints);
  }
  assert.deepEqual(
    computed.map((row) => row.seasonClubId),
    ["apex", "flux", "volt"],
  );
});
