import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLabel,
  isCompetitionFormat,
  normalizeGroupCount,
  resolveFormat,
} from "@/lib/sports/format";

test("division override wins over the competition format", () => {
  const resolved = resolveFormat({
    divisionFormat: "KNOCKOUT",
    competitionFormat: "ROUND_ROBIN",
  });
  assert.equal(resolved.format, "KNOCKOUT");
  assert.equal(resolved.source, "DIVISION");
});

test("no division override inherits the competition format", () => {
  const resolved = resolveFormat({ divisionFormat: null, competitionFormat: "GROUP_STAGE" });
  assert.equal(resolved.format, "GROUP_STAGE");
  assert.equal(resolved.source, "COMPETITION");
});

test("nothing set falls back to the round-robin default", () => {
  const resolved = resolveFormat({});
  assert.equal(resolved.format, "ROUND_ROBIN");
  assert.equal(resolved.source, "DEFAULT");
});

test("an unknown stored value never wins", () => {
  const resolved = resolveFormat({ divisionFormat: "LEAGUE", competitionFormat: "KNOCKOUT" });
  assert.equal(resolved.format, "KNOCKOUT");
  assert.equal(isCompetitionFormat("LEAGUE"), false);
});

test("group count: division override, else competition, else default", () => {
  assert.equal(resolveFormat({ divisionGroupCount: 4, competitionGroupCount: 8 }).groupCount, 4);
  assert.equal(resolveFormat({ competitionGroupCount: 3 }).groupCount, 3);
  assert.equal(resolveFormat({}).groupCount, 2);
});

test("group count is clamped into the supported range", () => {
  assert.equal(normalizeGroupCount(0), 2);
  assert.equal(normalizeGroupCount(1), 2);
  assert.equal(normalizeGroupCount(99), 16);
  assert.equal(normalizeGroupCount(3.7), 3);
  assert.equal(normalizeGroupCount(null), 2);
  assert.equal(resolveFormat({ divisionGroupCount: 1 }).groupCount, 2);
});

test("labels are human readable", () => {
  assert.equal(formatLabel("ROUND_ROBIN"), "League (round-robin)");
  assert.equal(formatLabel("KNOCKOUT"), "Knockout");
  assert.equal(formatLabel("GROUP_STAGE"), "Group stage");
});
