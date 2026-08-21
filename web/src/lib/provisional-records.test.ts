import assert from "node:assert/strict";
import test from "node:test";
import { checkRecordWatch, watchPlayerRecords } from "./provisional-records";
import type { RecordEntry } from "./analytics/records";

function record(overrides: Partial<RecordEntry>): RecordEntry {
  return { key: "Most Points — Game", category: "PLAYER_SINGLE_GAME", title: "Most Points — Game", value: "24", holderName: "X", holderClubShortName: "ABC", context: "", fixtureId: "f1", ...overrides };
}

test("checkRecordWatch returns NEW_PROVISIONAL when the live value exceeds the official record", () => {
  assert.equal(checkRecordWatch(25, 24), "NEW_PROVISIONAL");
});

test("checkRecordWatch returns TIED when the live value exactly equals the official record", () => {
  assert.equal(checkRecordWatch(24, 24), "TIED");
});

test("checkRecordWatch returns APPROACHING within the margin, and null further away", () => {
  assert.equal(checkRecordWatch(22, 24), "APPROACHING");
  assert.equal(checkRecordWatch(10, 24), null);
});

test("checkRecordWatch does not flag a player at 0 as APPROACHING a low-value record (found in the G.18 rehearsal)", () => {
  // Every player with 0 blocks would otherwise "approach" a record of 1 (diff=1 <= margin 3) -
  // a real player must have recorded at least 1 in the category first.
  assert.equal(checkRecordWatch(0, 1), null);
  assert.equal(checkRecordWatch(1, 1), "TIED");
});

test("watchPlayerRecords surfaces a NEW_PROVISIONAL points record and ignores unrelated categories", () => {
  const watches = watchPlayerRecords(
    { points: 25, rebounds: 3, assists: 2, steals: 0, blocks: 0 },
    [record({ title: "Most Points — Game", value: "24" }), record({ title: "Most Rebounds — Game", value: "15", key: "reb" })],
  );
  assert.equal(watches.length, 1);
  assert.equal(watches[0].status, "NEW_PROVISIONAL");
  assert.equal(watches[0].recordTitle, "Most Points — Game");
});

test("watchPlayerRecords ignores non-PLAYER_SINGLE_GAME record categories", () => {
  const watches = watchPlayerRecords(
    { points: 100, rebounds: 0, assists: 0, steals: 0, blocks: 0 },
    [record({ title: "Most Points — Game", value: "24", category: "TEAM" })],
  );
  assert.equal(watches.length, 0);
});

test("watchPlayerRecords returns nothing when the live line is far from every record", () => {
  const watches = watchPlayerRecords(
    { points: 2, rebounds: 1, assists: 0, steals: 0, blocks: 0 },
    [record({ title: "Most Points — Game", value: "24" })],
  );
  assert.equal(watches.length, 0);
});
