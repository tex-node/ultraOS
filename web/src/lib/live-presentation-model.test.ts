import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveUltraTimeState,
  buildMomentFeed,
  buildUltraScoringFeed,
  buildTeamComparison,
  buildFourPointBlock,
  buildTalkingPoints,
  buildLivePresentationModel,
  canPromoteToOfficialRecord,
} from "./live-presentation-model";
import type { LiveGameSnapshotV2, LiveGameSnapshotEventV2 } from "./live-game-snapshot-v2";
import { emptyTeamStats } from "./event-derived-stats";
import type { RecordEntry } from "./analytics/records";

function event(overrides: Partial<LiveGameSnapshotEventV2>): LiveGameSnapshotEventV2 {
  return {
    id: "e1", eventType: "SHOT_MADE", description: "desc", period: 1, clockSeconds: 400,
    sequenceNumber: 1, source: "ULTRA_NATIVE_LIVE_STATISTICIAN", status: "ACTIVE",
    playerId: "p1", playerName: "Obi", seasonClubId: "home", basePointValue: 2, multiplier: 1,
    points: 2, made: true, isUltraTime: false, isFourPointAttempt: false,
    homeScoreAfter: null, awayScoreAfter: null,
    ...overrides,
  };
}

function baseSnapshot(overrides: Partial<LiveGameSnapshotV2> = {}): LiveGameSnapshotV2 {
  return {
    gameId: "g1", fixtureId: "f1", status: "LIVE", period: 1, periodLabel: "HALF 1",
    clock: { remainingSeconds: 400, running: true }, shotClock: { remainingSeconds: 20, running: false },
    isUltraTimeActive: false, dataCapability: "FULL_ULTRA",
    score: { home: 10, away: 8 },
    teams: { home: { seasonClubId: "home", shortName: "VTX", name: "Vortex" }, away: { seasonClubId: "away", shortName: "APX", name: "Apex" } },
    liveBoxScore: { players: [], teams: { home: emptyTeamStats("home"), away: emptyTeamStats("away") } },
    leaders: [], startingFiveConfirmed: { home: true, away: true }, currentLineups: { home: [], away: [] },
    minutes: null, latestEvents: [], scoringChronology: [], reconciliation: { home: { officialScore: 10, statisticalScore: 10, difference: 0, status: "MATCHED" }, away: { officialScore: 8, statisticalScore: 8, difference: 0, status: "MATCHED" }, overallStatus: "MATCHED" },
    verification: { verifiedAt: null, verifiedById: null },
    provenance: { statSource: "ULTRA_NATIVE_LIVE_SCORER", dataCapability: "FULL_ULTRA" },
    ...overrides,
  };
}

test("Ultra Time: inactive outside the final period", () => {
  assert.deepEqual(deriveUltraTimeState(1, 30, false), { phase: "INACTIVE" });
});

test("Ultra Time: approaching within the 30s pre-window in the final period", () => {
  assert.deepEqual(deriveUltraTimeState(2, 85, false), { phase: "APPROACHING", secondsUntilStart: 25 });
});

test("Ultra Time: not yet approaching when still far from the 60s threshold", () => {
  assert.deepEqual(deriveUltraTimeState(2, 300, false), { phase: "INACTIVE" });
});

test("Ultra Time: active when the snapshot says so, regardless of the clock math", () => {
  assert.deepEqual(deriveUltraTimeState(2, 45, true), { phase: "ACTIVE" });
});

test("moment feed: a 3PT make during Ultra Time is described with provenance, never as a plain '6PT shot'", () => {
  const feed = buildMomentFeed([event({ eventType: "SHOT_MADE", basePointValue: 3, multiplier: 2, points: 6, isUltraTime: true, homeScoreAfter: 13, awayScoreAfter: 8 })], "VTX");
  assert.match(feed[0].text, /Obi hits a 3PT ×2/);
  assert.doesNotMatch(feed[0].text, /6PT/i);
  assert.match(feed[0].text, /VTX 13–8/);
});

test("moment feed: a missed shot is described as a miss, no score suffix", () => {
  const feed = buildMomentFeed([event({ eventType: "SHOT_MISSED", made: false, basePointValue: 4 })], "VTX");
  assert.equal(feed[0].text, "Obi misses a 4PT.");
});

test("moment feed excludes non-ACTIVE (voided/corrected) events", () => {
  const feed = buildMomentFeed([event({ status: "VOIDED" })], "VTX");
  assert.equal(feed.length, 0);
});

test("Ultra scoring feed only includes made Ultra-Time shots, never misses or non-Ultra makes", () => {
  const events = [
    event({ id: "a", isUltraTime: true, made: true, basePointValue: 4, multiplier: 2, points: 8 }),
    event({ id: "b", isUltraTime: true, made: false }),
    event({ id: "c", isUltraTime: false, made: true }),
  ];
  const feed = buildUltraScoringFeed(events);
  assert.deepEqual(feed.map((f) => f.id), ["a"]);
  assert.equal(feed[0].points, 8);
});

test("4PT block is null (capability-gated) for a non-FULL_ULTRA game", () => {
  const snapshot = baseSnapshot({ dataCapability: "BOX_SCORE_ONLY" });
  assert.equal(buildFourPointBlock(snapshot, "home"), null);
});

test("4PT block is populated for a FULL_ULTRA game, with percent null when no attempts exist", () => {
  const snapshot = baseSnapshot({ liveBoxScore: { players: [], teams: { home: { ...emptyTeamStats("home"), fourPointsMade: 0, fourPointsAttempted: 0 }, away: emptyTeamStats("away") } } });
  const block = buildFourPointBlock(snapshot, "home");
  assert.deepEqual(block, { made: 0, attempted: 0, percent: null });
});

test("4PT block computes a real percent once attempts exist", () => {
  const snapshot = baseSnapshot({ liveBoxScore: { players: [], teams: { home: { ...emptyTeamStats("home"), fourPointsMade: 1, fourPointsAttempted: 2 }, away: emptyTeamStats("away") } } });
  assert.equal(buildFourPointBlock(snapshot, "home")!.percent, "50%");
});

test("team comparison never renders a fabricated PAINT/BENCH row - only categories the live engine actually derives", () => {
  const rows = buildTeamComparison(baseSnapshot());
  const labels = rows.map((r) => r.label);
  assert.deepEqual(labels, ["FG%", "REB", "AST", "TOV", "PF"]);
  assert.equal(labels.includes("PAINT"), false);
  assert.equal(labels.includes("BENCH"), false);
});

test("talking points mention Ultra Time only when approaching or active, never when inactive", () => {
  const inactive = buildTalkingPoints(baseSnapshot(), { phase: "INACTIVE" }, []);
  assert.equal(inactive.some((p) => p.includes("Ultra Time")), false);
  const approaching = buildTalkingPoints(baseSnapshot(), { phase: "APPROACHING", secondsUntilStart: 12 }, []);
  assert.equal(approaching.some((p) => p.includes("Ultra Time begins in 12 seconds")), true);
});

test("talking points surface a NEW_PROVISIONAL record watch", () => {
  const points = buildTalkingPoints(baseSnapshot(), { phase: "INACTIVE" }, [{ recordKey: "k", recordTitle: "Most Points — Game", officialValue: 24, liveValue: 26, status: "NEW_PROVISIONAL" }]);
  assert.equal(points.some((p) => p.includes("new Season Zero high")), true);
});

test("canPromoteToOfficialRecord requires both FINAL and a real verification timestamp", () => {
  assert.equal(canPromoteToOfficialRecord("FINAL", "2026-01-01T00:00:00Z"), true);
  assert.equal(canPromoteToOfficialRecord("FINAL", null), false, "unverified FINAL game must not promote");
  assert.equal(canPromoteToOfficialRecord("LIVE", "2026-01-01T00:00:00Z"), false, "still-live game must not promote even if somehow verified");
});

test("buildLivePresentationModel composes a full model without crashing on an empty live game", () => {
  const model = buildLivePresentationModel(baseSnapshot(), []);
  assert.equal(model.gameId, "g1");
  assert.equal(model.isFinal, false);
  assert.equal(model.isStatisticsVerified, false);
  assert.equal(model.ultraTime.phase, "INACTIVE");
});

test("buildLivePresentationModel reflects FINAL + VERIFIED state distinctly from FINAL + unverified", () => {
  const unverified = buildLivePresentationModel(baseSnapshot({ status: "FINAL" }), []);
  assert.equal(unverified.isFinal, true);
  assert.equal(unverified.isStatisticsVerified, false);

  const verified = buildLivePresentationModel(baseSnapshot({ status: "FINAL", verification: { verifiedAt: "2026-01-01T00:00:00Z", verifiedById: "u1" } }), []);
  assert.equal(verified.isFinal, true);
  assert.equal(verified.isStatisticsVerified, true);
});

test("record watch recomputes fresh from whatever live stats are passed in - a post-correction change changes the result deterministically (no invalidation step needed, no stale cache)", () => {
  const officialRecords: RecordEntry[] = [{ key: "k", category: "PLAYER_SINGLE_GAME", title: "Most Points — Game", value: "24", holderName: "X", holderClubShortName: "ABC", context: "", fixtureId: "f1" }];
  const before = buildLivePresentationModel(baseSnapshot({ liveBoxScore: { players: [{ playerId: "p1", seasonClubId: "home", points: 20, fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointsMade: 0, twoPointsAttempted: 0, threePointsMade: 0, threePointsAttempted: 0, fourPointsMade: 0, fourPointsAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0, ultraTimePoints: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 }], teams: { home: emptyTeamStats("home"), away: emptyTeamStats("away") } } }), officialRecords);
  assert.equal(before.recordWatches.length, 0, "20 points is not yet within the APPROACHING margin of 24");

  const afterCorrection = buildLivePresentationModel(baseSnapshot({ liveBoxScore: { players: [{ playerId: "p1", seasonClubId: "home", points: 25, fieldGoalsMade: 0, fieldGoalsAttempted: 0, twoPointsMade: 0, twoPointsAttempted: 0, threePointsMade: 0, threePointsAttempted: 0, fourPointsMade: 0, fourPointsAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0, offensiveRebounds: 0, defensiveRebounds: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0, ultraTimePoints: 0, ultraTimeFieldGoalsMade: 0, ultraTimeFieldGoalsAttempted: 0 }], teams: { home: emptyTeamStats("home"), away: emptyTeamStats("away") } } }), officialRecords);
  assert.equal(afterCorrection.recordWatches[0].status, "NEW_PROVISIONAL");
});
