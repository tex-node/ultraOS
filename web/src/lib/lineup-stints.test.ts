import assert from "node:assert/strict";
import test from "node:test";
import {
  reconstructLineupStints,
  deriveMinutesFromStints,
  verifyTeamMinutes,
  elapsedSecondsBetween,
  periodDurationFor,
  formatMinutes,
  LEGACY_CLOCK_RULE_SNAPSHOT,
  type SubstitutionWithClock,
} from "./lineup-stints";
import type { LineupEntry } from "./lineup";

const HOME = "home-club";
const STARTERS: LineupEntry[] = ["h1", "h2", "h3", "h4", "h5"].map((playerId) => ({ seasonClubId: HOME, playerId }));

test("periodDurationFor returns regulation length within periodCount, overtime length beyond it", () => {
  assert.equal(periodDurationFor(1, LEGACY_CLOCK_RULE_SNAPSHOT), 600);
  assert.equal(periodDurationFor(2, LEGACY_CLOCK_RULE_SNAPSHOT), 600);
  assert.equal(periodDurationFor(3, LEGACY_CLOCK_RULE_SNAPSHOT), 300);
});

test("elapsedSecondsBetween within one period is a simple countdown difference", () => {
  assert.equal(elapsedSecondsBetween({ period: 1, clockSeconds: 600 }, { period: 1, clockSeconds: 400 }, LEGACY_CLOCK_RULE_SNAPSHOT), 200);
});

test("elapsedSecondsBetween across periods sums the remainder, full periods between, and the elapsed end-period portion", () => {
  // period 1: 600 -> 0 (600s), period 2 (skipped, full): 600s, period 3: 300 -> 250 (50s) = 1250s
  const result = elapsedSecondsBetween({ period: 1, clockSeconds: 600 }, { period: 3, clockSeconds: 250 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.equal(result, 1250);
});

test("elapsedSecondsBetween rejects clock ordering that runs backward", () => {
  assert.equal(elapsedSecondsBetween({ period: 2, clockSeconds: 100 }, { period: 1, clockSeconds: 500 }, LEGACY_CLOCK_RULE_SNAPSHOT), "INVALID_CLOCK_ORDERING");
  assert.equal(elapsedSecondsBetween({ period: 1, clockSeconds: 100 }, { period: 1, clockSeconds: 200 }, LEGACY_CLOCK_RULE_SNAPSHOT), "INVALID_CLOCK_ORDERING");
});

test("with no substitutions, one stint spans the whole game and every starter gets full minutes", () => {
  const result = reconstructLineupStints(HOME, STARTERS, [], { period: 2, clockSeconds: 0 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.stints.length, 1);
  assert.equal(result.stints[0].durationSeconds, 1200); // 2 full 600s periods
  const minutes = deriveMinutesFromStints(result.stints);
  for (const starter of STARTERS) assert.equal(minutes.get(starter.playerId), 1200);
});

test("a single substitution produces two stints with correct durations for outgoing/incoming players", () => {
  const subs: SubstitutionWithClock[] = [{ seasonClubId: HOME, playerInId: "h6", playerOutId: "h1", sequenceNumber: 1, period: 1, clockSeconds: 400 }];
  const result = reconstructLineupStints(HOME, STARTERS, subs, { period: 2, clockSeconds: 0 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.stints.length, 2);
  assert.equal(result.stints[0].durationSeconds, 200); // 600 -> 400
  assert.equal(result.stints[1].durationSeconds, 1000); // remaining 400s of period 1 + 600s of period 2
  const minutes = deriveMinutesFromStints(result.stints);
  assert.equal(minutes.get("h1"), 200, "h1 played only the first stint");
  assert.equal(minutes.get("h6"), 1000, "h6 played the rest of the game");
  assert.equal(minutes.get("h2"), 1200, "an uninvolved starter played the full game");
});

test("a player who never enters has zero minutes (not present in the derived map at all)", () => {
  const result = reconstructLineupStints(HOME, STARTERS, [], { period: 2, clockSeconds: 0 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  const minutes = deriveMinutesFromStints(result.stints);
  assert.equal(minutes.has("h9"), false);
});

test("overtime minutes: a stint extending into period 3 uses the overtime duration, not regulation", () => {
  const result = reconstructLineupStints(HOME, STARTERS, [], { period: 3, clockSeconds: 0 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.stints[0].durationSeconds, 600 + 600 + 300); // 2 regulation + 1 overtime period
});

test("multiple stints: a player subbed out and later re-entering produces separate stints that sum correctly", () => {
  const subs: SubstitutionWithClock[] = [
    { seasonClubId: HOME, playerInId: "h6", playerOutId: "h1", sequenceNumber: 1, period: 1, clockSeconds: 400 },
    { seasonClubId: HOME, playerInId: "h1", playerOutId: "h6", sequenceNumber: 2, period: 1, clockSeconds: 100 },
  ];
  const result = reconstructLineupStints(HOME, STARTERS, subs, { period: 2, clockSeconds: 0 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  const minutes = deriveMinutesFromStints(result.stints);
  assert.equal(minutes.get("h1"), 200 + 700, "h1's two separate stints (600->400, then 100->0 of period1 + all of period2)");
  assert.equal(minutes.get("h6"), 300, "h6's single middle stint (400->100)");
});

test("reconstruction rejects substituting out a player who is not on court (malformed history, not silently repaired)", () => {
  const subs: SubstitutionWithClock[] = [{ seasonClubId: HOME, playerInId: "h6", playerOutId: "h9", sequenceNumber: 1, period: 1, clockSeconds: 400 }];
  const result = reconstructLineupStints(HOME, STARTERS, subs, { period: 2, clockSeconds: 0 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.deepEqual(result.valid, false);
  if (result.valid) return;
  assert.equal(result.error, "SUBSTITUTION_OUT_NOT_ON_COURT");
});

test("reconstruction rejects a starting five with fewer or more than 5 distinct players", () => {
  const tooFew: LineupEntry[] = [{ seasonClubId: HOME, playerId: "h1" }, { seasonClubId: HOME, playerId: "h2" }];
  const result = reconstructLineupStints(HOME, tooFew, [], { period: 2, clockSeconds: 0 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.error, "INVALID_STARTING_FIVE_SIZE");
});

test("reconstruction rejects a missing starting five for the requested team entirely", () => {
  const result = reconstructLineupStints("some-other-club", STARTERS, [], { period: 2, clockSeconds: 0 }, LEGACY_CLOCK_RULE_SNAPSHOT);
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.error, "MISSING_STARTING_FIVE");
});

test("verifyTeamMinutes reports MINUTES_UNAVAILABLE when no starting five was ever confirmed", () => {
  const result = verifyTeamMinutes("no-starters-club", STARTERS, [], { period: 2, clockSeconds: 0 });
  assert.equal(result.confidence, "MINUTES_UNAVAILABLE");
});

test("verifyTeamMinutes reports MINUTES_INCOMPLETE (never a fabricated number) when reconstruction fails", () => {
  const subs: SubstitutionWithClock[] = [{ seasonClubId: HOME, playerInId: "h6", playerOutId: "h9", sequenceNumber: 1, period: 1, clockSeconds: 400 }];
  const result = verifyTeamMinutes(HOME, STARTERS, subs, { period: 2, clockSeconds: 0 });
  assert.equal(result.confidence, "MINUTES_INCOMPLETE");
  assert.equal(result.playerSeconds.size, 0);
});

test("verifyTeamMinutes reports MINUTES_VERIFIED and satisfies 5x elapsed = sum(player seconds) for clean history", () => {
  const subs: SubstitutionWithClock[] = [
    { seasonClubId: HOME, playerInId: "h6", playerOutId: "h1", sequenceNumber: 1, period: 1, clockSeconds: 400 },
    { seasonClubId: HOME, playerInId: "h7", playerOutId: "h2", sequenceNumber: 2, period: 2, clockSeconds: 300 },
  ];
  const result = verifyTeamMinutes(HOME, STARTERS, subs, { period: 2, clockSeconds: 0 });
  assert.equal(result.confidence, "MINUTES_VERIFIED");
  assert.equal(result.actualTeamPlayerSeconds, result.expectedTeamPlayerSeconds);
  assert.equal(result.expectedTeamPlayerSeconds, 5 * 1200);
});

test("formatMinutes renders MM:SS", () => {
  assert.equal(formatMinutes(0), "0:00");
  assert.equal(formatMinutes(65), "1:05");
  assert.equal(formatMinutes(1200), "20:00");
});
