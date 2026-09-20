import assert from "node:assert/strict";
import test from "node:test";
import { tournamentStatusFromFixtureStatuses } from "@/lib/tournament-subsite";

test("live fixtures dominate every other status", () => {
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL", "LIVE", "SCHEDULED"]), "LIVE");
});

test("scheduled fixtures mean upcoming when nothing is live", () => {
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL", "SCHEDULED"]), "UPCOMING");
});

test("all-final means completed, empty means draft", () => {
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL", "CANCELLED"]), "COMPLETED");
  assert.equal(tournamentStatusFromFixtureStatuses([]), "DRAFT");
  assert.equal(tournamentStatusFromFixtureStatuses(["CANCELLED", "POSTPONED"]), "DRAFT");
});
