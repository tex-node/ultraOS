import assert from "node:assert/strict";
import test from "node:test";
import { tournamentStatusFromFixtureStatuses } from "@/lib/tournament-subsite";

test("live fixtures dominate every other status", () => {
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL", "LIVE", "SCHEDULED"]), "LIVE");
});

test("scheduled fixtures mean upcoming when nothing is live", () => {
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL", "SCHEDULED"]), "UPCOMING");
});

test("all-final means ongoing unless every season is explicitly marked completed", () => {
  // Regression (2026-09-23): LBCL's season is ACTIVE with 10 FINAL fixtures and more rounds
  // still to come - it must never read as "Completed" just because nothing is SCHEDULED yet.
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL", "CANCELLED"]), "ONGOING");
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL"], ["ACTIVE"]), "ONGOING");
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL"], ["DRAFT"]), "ONGOING");
});

test("all-final is completed only when every season is explicitly COMPLETED", () => {
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL"], ["COMPLETED"]), "COMPLETED");
  // A multi-season competition (e.g. Ultra Basketball with a completed Season Zero and an
  // upcoming Season One) is not "Completed" just because its oldest season is.
  assert.equal(tournamentStatusFromFixtureStatuses(["FINAL"], ["COMPLETED", "ACTIVE"]), "ONGOING");
});

test("empty fixture list means draft regardless of season status", () => {
  assert.equal(tournamentStatusFromFixtureStatuses([]), "DRAFT");
  assert.equal(tournamentStatusFromFixtureStatuses(["CANCELLED", "POSTPONED"]), "DRAFT");
});
