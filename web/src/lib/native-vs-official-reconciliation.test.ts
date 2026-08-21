import assert from "node:assert/strict";
import test from "node:test";
import { compareField, reconcileLine, reconcilePlayers, summarizeGameReconciliation, type StatSourceLine } from "./native-vs-official-reconciliation";

test("compareField reports MATCH when both sources agree", () => {
  const result = compareField("points", { points: 12 }, { points: 12 });
  assert.equal(result.state, "MATCH");
});

test("compareField reports MISMATCH when both sources provide different values", () => {
  const result = compareField("rebounds", { rebounds: 5 }, { rebounds: 6 });
  assert.deepEqual(result, { field: "rebounds", nativeValue: 5, officialValue: 6, state: "MISMATCH" });
});

test("compareField reports NATIVE_ONLY when only the native source provides a value", () => {
  const result = compareField("fourPointsMade", { fourPointsMade: 2 }, {});
  assert.equal(result.state, "NATIVE_ONLY");
});

test("compareField reports OFFICIAL_ONLY when only the official source provides a value", () => {
  const result = compareField("points", {}, { points: 10 });
  assert.equal(result.state, "OFFICIAL_ONLY");
});

test("compareField reports NOT_COMPARABLE when neither source provides a value - never fabricated as a mismatch", () => {
  const result = compareField("fourPointsAttempted", {}, {});
  assert.equal(result.state, "NOT_COMPARABLE");
});

test("Ultra-specific fields (4PT) come back NATIVE_ONLY against a Season-Zero-style official PDF line that never captures them - not a mismatch, not fabricated on the official side", () => {
  const native: StatSourceLine = { points: 12, fourPointsMade: 1, fourPointsAttempted: 2 };
  const official: StatSourceLine = { points: 12 }; // a real FIBA-style PDF line: no 4PT concept at all
  const result = reconcileLine(native, official, ["points", "fourPointsMade", "fourPointsAttempted"]);
  const fourPM = result.fields.find((f) => f.field === "fourPointsMade")!;
  const fourPA = result.fields.find((f) => f.field === "fourPointsAttempted")!;
  assert.equal(fourPM.state, "NATIVE_ONLY");
  assert.equal(fourPA.state, "NATIVE_ONLY");
  assert.equal(result.state, "PARTIAL_MATCH", "a real MATCH on points plus NATIVE_ONLY Ultra fields is a partial match, not a mismatch");
});

test("reconcileLine reports FULL_MATCH when every comparable field agrees", () => {
  const line: StatSourceLine = { points: 12, rebounds: 5, assists: 3 };
  const result = reconcileLine(line, { ...line }, ["points", "rebounds", "assists"]);
  assert.equal(result.state, "FULL_MATCH");
});

test("reconcileLine reports MISMATCH if even one field disagrees, regardless of how many others match", () => {
  const result = reconcileLine(
    { points: 12, rebounds: 5, assists: 3 },
    { points: 12, rebounds: 6, assists: 3 },
    ["points", "rebounds", "assists"],
  );
  assert.equal(result.state, "MISMATCH");
});

test("reconcileLine reports INSUFFICIENT_DATA when nothing is comparable at all", () => {
  const result = reconcileLine({}, {}, ["points", "rebounds"]);
  assert.equal(result.state, "INSUFFICIENT_DATA");
});

test("reconcilePlayers includes a player who exists in only one source", () => {
  const native = new Map<string, StatSourceLine>([["p1", { points: 10 }]]);
  const official = new Map<string, StatSourceLine>([["p1", { points: 10 }], ["p2", { points: 8 }]]);
  const results = reconcilePlayers(native, official);
  assert.equal(results.length, 2);
  const p2 = results.find((r) => r.playerId === "p2")!;
  assert.equal(p2.state, "PARTIAL_MATCH");
  assert.equal(p2.fields.find((f) => f.field === "points")!.state, "OFFICIAL_ONLY");
});

test("summarizeGameReconciliation escalates to the worst state present across players and teams", () => {
  const matched = { playerId: "p1", state: "FULL_MATCH" as const, fields: [] };
  const mismatched = { playerId: "p2", state: "MISMATCH" as const, fields: [] };
  const summary = summarizeGameReconciliation([matched, mismatched], []);
  assert.equal(summary.overallState, "MISMATCH");
});

test("summarizeGameReconciliation reports FULL_MATCH only when nothing worse exists anywhere", () => {
  const summary = summarizeGameReconciliation(
    [{ playerId: "p1", state: "FULL_MATCH", fields: [] }],
    [{ seasonClubId: "t1", state: "FULL_MATCH", fields: [] }],
  );
  assert.equal(summary.overallState, "FULL_MATCH");
});
