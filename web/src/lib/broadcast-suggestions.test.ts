import assert from "node:assert/strict";
import test from "node:test";
import { buildGraphicSuggestions } from "./broadcast-suggestions";
import type { LivePresentationModel } from "./live-presentation-model";

function baseModel(overrides: Partial<LivePresentationModel> = {}): LivePresentationModel {
  return {
    gameId: "g1", fixtureId: "f1", status: "LIVE", isFinal: false, isStatisticsVerified: false,
    period: 2, periodLabel: "HALF 2", clock: { remainingSeconds: 300, running: true }, shotClock: { remainingSeconds: 20, running: false },
    score: { home: 10, away: 8 },
    teams: { home: { seasonClubId: "home", shortName: "VTX", name: "Vortex" }, away: { seasonClubId: "away", shortName: "APX", name: "Apex" } },
    ultraTime: { phase: "INACTIVE" }, ultraScoringFeed: [], fourPoint: { home: null, away: null },
    leaders: [], players: [], teamComparison: [], momentFeed: [], latestEvents: [], currentLineups: null, minutes: null,
    recordWatches: [], liveMilestones: [], talkingPoints: [],
    gamePulse: { points: [], leadChanges: 0, ties: 0, largestLead: null, largestRun: null, currentRun: null, ultraTimeStart: null },
    gameStory: null,
    dataCapability: "FULL_ULTRA",
    reconciliation: { home: { officialScore: 10, statisticalScore: 10, difference: 0, status: "MATCHED" }, away: { officialScore: 8, statisticalScore: 8, difference: 0, status: "MATCHED" }, overallStatus: "MATCHED" },
    provenance: { statSource: "ULTRA_NATIVE_LIVE_SCORER", dataCapability: "FULL_ULTRA" },
    ...overrides,
  };
}

test("buildGraphicSuggestions suggests FINAL_SCORE only, once the game is FINAL", () => {
  const suggestions = buildGraphicSuggestions(baseModel({ isFinal: true, ultraTime: { phase: "ACTIVE" } }));
  assert.deepEqual(suggestions.map((s) => s.graphicType), ["FINAL_SCORE"]);
});

test("buildGraphicSuggestions suggests ULTRA_TIME when active or approaching", () => {
  assert.equal(buildGraphicSuggestions(baseModel({ ultraTime: { phase: "ACTIVE" } }))[0].graphicType, "ULTRA_TIME");
  assert.equal(buildGraphicSuggestions(baseModel({ ultraTime: { phase: "APPROACHING", secondsUntilStart: 10 } }))[0].graphicType, "ULTRA_TIME");
});

test("buildGraphicSuggestions suggests FOUR_POINT_MOMENT after a made 4PT shot", () => {
  const suggestions = buildGraphicSuggestions(baseModel({ ultraScoringFeed: [{ id: "e1", playerName: "Obi", basePointValue: 4, multiplier: 1, points: 4 }] }));
  assert.ok(suggestions.some((s) => s.graphicType === "FOUR_POINT_MOMENT"));
});

test("buildGraphicSuggestions suggests RECORD_WATCH for a NEW_PROVISIONAL or TIED watch, not APPROACHING", () => {
  const suggestions = buildGraphicSuggestions(baseModel({
    recordWatches: [{ recordKey: "k", recordTitle: "Most Points — Game", officialValue: 24, liveValue: 25, status: "NEW_PROVISIONAL" }],
  }));
  assert.ok(suggestions.some((s) => s.graphicType === "RECORD_WATCH"));

  const approachingOnly = buildGraphicSuggestions(baseModel({
    recordWatches: [{ recordKey: "k", recordTitle: "Most Points — Game", officialValue: 24, liveValue: 22, status: "APPROACHING" }],
  }));
  assert.ok(!approachingOnly.some((s) => s.graphicType === "RECORD_WATCH"));
});

test("buildGraphicSuggestions never returns a suggestion that isn't backed by real model data", () => {
  const suggestions = buildGraphicSuggestions(baseModel());
  assert.deepEqual(suggestions, []);
});
