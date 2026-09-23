import assert from "node:assert/strict";
import test from "node:test";
import { tournamentStatusFromSeasons, type SeasonFixtureSummary } from "@/lib/tournament-subsite";

function season(fixtureStatuses: string[], seasonStatus: string): SeasonFixtureSummary {
  return { fixtureStatuses, seasonStatus };
}

test("no seasons at all means draft", () => {
  assert.equal(tournamentStatusFromSeasons([]), "DRAFT");
});

test("a season with no fixtures yet reads upcoming, not draft", () => {
  // Regression (2026-09-23): GIESM has registration open and a real public page, but no
  // fixtures scheduled yet - that must read as "coming soon", not "not ready".
  assert.equal(tournamentStatusFromSeasons([season([], "DRAFT")]), "UPCOMING");
});

test("a live fixture in any season dominates every other status", () => {
  assert.equal(
    tournamentStatusFromSeasons([season(["FINAL", "LIVE"], "ACTIVE"), season([], "DRAFT")]),
    "LIVE",
  );
});

test("a scheduled fixture means upcoming when nothing is live", () => {
  assert.equal(tournamentStatusFromSeasons([season(["FINAL", "SCHEDULED"], "ACTIVE")]), "UPCOMING");
});

test("all-final in a season not marked COMPLETED reads ongoing, never completed", () => {
  // Regression: LBCL's season is ACTIVE with 10 FINAL fixtures and more rounds still to
  // come - it must never read as "Completed" just because nothing is SCHEDULED yet.
  assert.equal(tournamentStatusFromSeasons([season(["FINAL", "CANCELLED"], "ACTIVE")]), "ONGOING");
  assert.equal(tournamentStatusFromSeasons([season(["FINAL"], "DRAFT")]), "ONGOING");
});

test("completed only when every season is explicitly COMPLETED", () => {
  assert.equal(tournamentStatusFromSeasons([season(["FINAL"], "COMPLETED")]), "COMPLETED");
});

test("a completed season plus a brand-new empty season reads upcoming (Ultra Basketball: Season Zero done, Season One announced)", () => {
  assert.equal(
    tournamentStatusFromSeasons([season(["FINAL"], "COMPLETED"), season([], "DRAFT")]),
    "UPCOMING",
  );
});

test("a completed season plus an in-progress season reads ongoing, not upcoming", () => {
  assert.equal(
    tournamentStatusFromSeasons([season(["FINAL"], "COMPLETED"), season(["FINAL"], "ACTIVE")]),
    "ONGOING",
  );
});
