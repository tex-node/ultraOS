import assert from "node:assert/strict";
import test from "node:test";
import { calculateStandings, compareStandings } from "./standings";

test("calculates win points and score totals for SeasonClubs", () => {
  const rows = calculateStandings(["vortex-2026", "apex-2026"], [{
    homeSeasonClubId: "vortex-2026",
    awaySeasonClubId: "apex-2026",
    homeScore: 82,
    awayScore: 76,
    winnerSeasonClubId: "vortex-2026",
  }]);
  assert.deepEqual(rows.get("vortex-2026"), {
    played: 1, won: 1, lost: 0, pointsFor: 82, pointsAgainst: 76,
    pointDifference: 6, leaguePoints: 3,
  });
  assert.equal(rows.get("apex-2026")?.leaguePoints, 0);
});

test("orders by league points, wins, difference, points for, then club name", () => {
  const rows = [
    { name: "Vortex", leaguePoints: 3, won: 1, pointDifference: 5, pointsFor: 80 },
    { name: "Apex", leaguePoints: 3, won: 1, pointDifference: 5, pointsFor: 80 },
    { name: "Flux", leaguePoints: 3, won: 1, pointDifference: 8, pointsFor: 75 },
    { name: "Surge", leaguePoints: 6, won: 2, pointDifference: 1, pointsFor: 120 },
  ].sort(compareStandings);
  assert.deepEqual(rows.map((row) => row.name), ["Surge", "Flux", "Apex", "Vortex"]);
});
