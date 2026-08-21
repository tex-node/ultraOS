import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlayerIdentityCandidates, type RosterPlayer } from "./player-identity-constraints";

const roster: RosterPlayer[] = [
  { playerId: "p1", seasonClubId: "home", jerseyNumber: 12 },
  { playerId: "p2", seasonClubId: "home", jerseyNumber: 7 },
  { playerId: "p3", seasonClubId: "away", jerseyNumber: 12 },
];

test("resolvePlayerIdentityCandidates: team + jersey together uniquely resolve a candidate", () => {
  const result = resolvePlayerIdentityCandidates({ roster, teamCandidateSeasonClubId: "home", jerseyCandidateNumber: 12, currentLineupPlayerIds: null });
  assert.equal(result.uniqueMatch?.playerId, "p1");
});

test("resolvePlayerIdentityCandidates: jersey number alone is ambiguous across teams", () => {
  const result = resolvePlayerIdentityCandidates({ roster, teamCandidateSeasonClubId: null, jerseyCandidateNumber: 12, currentLineupPlayerIds: null });
  assert.equal(result.uniqueMatch, null);
  assert.equal(result.candidates.length, 2);
});

test("resolvePlayerIdentityCandidates: a jersey number with no roster match rules out every candidate on that team", () => {
  const result = resolvePlayerIdentityCandidates({ roster, teamCandidateSeasonClubId: "home", jerseyCandidateNumber: 99, currentLineupPlayerIds: null });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.uniqueMatch, null);
});

test("resolvePlayerIdentityCandidates: lineup context excludes a player not currently on court", () => {
  const result = resolvePlayerIdentityCandidates({ roster, teamCandidateSeasonClubId: "home", jerseyCandidateNumber: null, currentLineupPlayerIds: ["p2"] });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].player.playerId, "p2");
});

test("resolvePlayerIdentityCandidates: no team/jersey/lineup context returns every roster player as a weak candidate, never a forced guess", () => {
  const result = resolvePlayerIdentityCandidates({ roster, teamCandidateSeasonClubId: null, jerseyCandidateNumber: null, currentLineupPlayerIds: null });
  assert.equal(result.candidates.length, roster.length);
  assert.equal(result.uniqueMatch, null);
});
