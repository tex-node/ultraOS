import assert from "node:assert/strict";
import test from "node:test";
import { deriveLineup, validateSubstitution, type LineupEntry, type SubstitutionRecord } from "./lineup";

const HOME = "home-club";
const AWAY = "away-club";
const START: LineupEntry[] = [
  { seasonClubId: HOME, playerId: "h1" }, { seasonClubId: HOME, playerId: "h2" },
  { seasonClubId: HOME, playerId: "h3" }, { seasonClubId: HOME, playerId: "h4" },
  { seasonClubId: HOME, playerId: "h5" },
  { seasonClubId: AWAY, playerId: "a1" }, { seasonClubId: AWAY, playerId: "a2" },
  { seasonClubId: AWAY, playerId: "a3" }, { seasonClubId: AWAY, playerId: "a4" },
  { seasonClubId: AWAY, playerId: "a5" },
];

test("with no substitutions, the on-court lineup is exactly the starting five per team", () => {
  const lineup = deriveLineup(START, []);
  assert.equal(lineup.get(HOME)!.size, 5);
  assert.equal(lineup.get(AWAY)!.size, 5);
  assert.equal(lineup.get(HOME)!.has("h1"), true);
});

test("a single substitution swaps exactly one player in and one out", () => {
  const subs: SubstitutionRecord[] = [{ seasonClubId: HOME, playerInId: "h6", playerOutId: "h1", sequenceNumber: 1 }];
  const lineup = deriveLineup(START, subs);
  assert.equal(lineup.get(HOME)!.has("h1"), false);
  assert.equal(lineup.get(HOME)!.has("h6"), true);
  assert.equal(lineup.get(HOME)!.size, 5);
  assert.equal(lineup.get(AWAY)!.size, 5, "the other team's lineup is untouched");
});

test("multiple stints: a player subbed out and later re-entering is reflected correctly", () => {
  const subs: SubstitutionRecord[] = [
    { seasonClubId: HOME, playerInId: "h6", playerOutId: "h1", sequenceNumber: 1 },
    { seasonClubId: HOME, playerInId: "h1", playerOutId: "h6", sequenceNumber: 2 },
  ];
  const lineup = deriveLineup(START, subs);
  assert.equal(lineup.get(HOME)!.has("h1"), true);
  assert.equal(lineup.get(HOME)!.has("h6"), false);
});

test("substitutions apply in sequenceNumber order regardless of array order", () => {
  const subs: SubstitutionRecord[] = [
    { seasonClubId: HOME, playerInId: "h1", playerOutId: "h6", sequenceNumber: 2 },
    { seasonClubId: HOME, playerInId: "h6", playerOutId: "h1", sequenceNumber: 1 },
  ];
  const lineup = deriveLineup(START, subs);
  assert.equal(lineup.get(HOME)!.has("h1"), true);
});

test("validateSubstitution rejects subbing out a player who is not on court", () => {
  const lineup = deriveLineup(START, []);
  const result = validateSubstitution(lineup, HOME, "h6", "h9");
  assert.deepEqual(result, { valid: false, error: "PLAYER_OUT_NOT_ON_COURT" });
});

test("validateSubstitution rejects subbing in a player already on court", () => {
  const lineup = deriveLineup(START, []);
  const result = validateSubstitution(lineup, HOME, "h2", "h1");
  assert.deepEqual(result, { valid: false, error: "PLAYER_IN_ALREADY_ON_COURT" });
});

test("validateSubstitution rejects the same player as both in and out", () => {
  const lineup = deriveLineup(START, []);
  const result = validateSubstitution(lineup, HOME, "h1", "h1");
  assert.deepEqual(result, { valid: false, error: "SAME_PLAYER_IN_AND_OUT" });
});

test("validateSubstitution accepts a legal swap", () => {
  const lineup = deriveLineup(START, []);
  assert.deepEqual(validateSubstitution(lineup, HOME, "h6", "h1"), { valid: true });
});

test("a duplicate submission of the same substitution is rejected without a special-case rule", () => {
  const afterFirst = deriveLineup(START, [{ seasonClubId: HOME, playerInId: "h6", playerOutId: "h1", sequenceNumber: 1 }]);
  const result = validateSubstitution(afterFirst, HOME, "h6", "h1");
  assert.deepEqual(result, { valid: false, error: "PLAYER_OUT_NOT_ON_COURT" }, "h1 is already off court, so the duplicate naturally fails the same check");
});
