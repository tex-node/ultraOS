import assert from "node:assert/strict";
import test from "node:test";
import { BASKETBALL } from "@/lib/sports/basketball";
import {
  metricDefinitionFor,
  metricEntriesFromRecord,
  metricSubjectKey,
  recordFromMetricEntries,
} from "@/lib/sports/metric-values";

test("subject keys are non-null discriminators", () => {
  assert.equal(metricSubjectKey("PLAYER", "p1"), "PLAYER:p1");
  assert.equal(metricSubjectKey("ENTRANT", "e1"), "ENTRANT:e1");
});

test("player stat records project to declared metrics and round-trip exactly", () => {
  const playerStat: Record<string, unknown> = {
    points: 12,
    rebounds: 5,
    assists: 3,
    steals: 1,
    blocks: 2,
    turnovers: 4,
    fouls: 2,
    minutesPlayed: 28,
    threePointsMade: 2,
    fieldGoalsMade: null,
    plusMinus: 7,
  };

  const entries = metricEntriesFromRecord(BASKETBALL, "PLAYER", playerStat);
  const keys = entries.map((entry) => entry.key).sort();
  assert.deepEqual(keys, [
    "assists",
    "blocks",
    "fouls",
    "minutesPlayed",
    "points",
    "rebounds",
    "steals",
    "threePointsMade",
    "turnovers",
  ]);
  assert.equal(entries.every((entry) => entry.subject === "PLAYER"), true);

  const roundTripped = recordFromMetricEntries(BASKETBALL, "PLAYER", entries);
  assert.deepEqual(roundTripped, {
    points: 12,
    rebounds: 5,
    assists: 3,
    steals: 1,
    blocks: 2,
    turnovers: 4,
    fouls: 2,
    minutesPlayed: 28,
    threePointsMade: 2,
  });
});

test("null and non-numeric values are skipped, never coerced to zero", () => {
  const entries = metricEntriesFromRecord(BASKETBALL, "PLAYER", {
    points: 0,
    rebounds: null,
    assists: undefined,
    steals: "3",
  });
  assert.deepEqual(entries, [{ key: "points", subject: "PLAYER", value: 0 }]);
});

test("team stat records project to entrant metrics", () => {
  const entries = metricEntriesFromRecord(BASKETBALL, "ENTRANT", {
    points: 88,
    rebounds: 41,
    assists: 20,
    turnovers: 11,
    fouls: 17,
    pointsInPaint: 40,
  });
  assert.deepEqual(entries.map((entry) => entry.key).sort(), [
    "assists",
    "fouls",
    "points",
    "rebounds",
    "turnovers",
  ]);
});

test("recordFromMetricEntries ignores undeclared keys and wrong-subject entries", () => {
  const record = recordFromMetricEntries(BASKETBALL, "PLAYER", [
    { key: "points", subject: "PLAYER", value: 2 },
    { key: "points", subject: "PLAYER", value: 3 },
    { key: "points", subject: "ENTRANT", value: 100 },
    { key: "notAMetric", subject: "PLAYER", value: 9 },
  ]);
  assert.deepEqual(record, { points: 5 });
});

test("metricDefinitionFor only matches the requested subject", () => {
  assert.equal(metricDefinitionFor(BASKETBALL, "PLAYER", "points")?.subject, "PLAYER");
  assert.equal(metricDefinitionFor(BASKETBALL, "ENTRANT", "points")?.subject, "ENTRANT");
  assert.equal(metricDefinitionFor(BASKETBALL, "PLAYER", "notAMetric"), undefined);
});
