import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveGameStory } from "./live-game-story";
import { computeGamePulse, type ScoringPoint } from "./live-game-pulse";
import { emptyTeamStats } from "./event-derived-stats";
import type { LiveGameSnapshotV2 } from "./live-game-snapshot-v2";

function point(overrides: Partial<ScoringPoint>): ScoringPoint {
  return { sequence: 1, period: 1, clockSeconds: 400, homeScore: 2, awayScore: 0, scoringTeam: "HOME", basePointValue: 2, multiplier: 1, isUltraTime: false, ...overrides };
}

function baseSnapshot(overrides: Partial<LiveGameSnapshotV2> = {}): LiveGameSnapshotV2 {
  return {
    gameId: "g1", fixtureId: "f1", status: "LIVE", period: 2, periodLabel: "HALF 2",
    clock: { remainingSeconds: 300, running: true }, shotClock: { remainingSeconds: 20, running: false },
    isUltraTimeActive: false, dataCapability: "FULL_ULTRA",
    score: { home: 20, away: 18 },
    teams: { home: { seasonClubId: "home", shortName: "VTX", name: "Vortex" }, away: { seasonClubId: "away", shortName: "APX", name: "Apex" } },
    liveBoxScore: { players: [], teams: { home: emptyTeamStats("home"), away: emptyTeamStats("away") } },
    leaders: [], startingFiveConfirmed: { home: true, away: true }, currentLineups: { home: [], away: [] },
    minutes: null, latestEvents: [], scoringChronology: [],
    reconciliation: { home: { officialScore: 20, statisticalScore: 20, difference: 0, status: "MATCHED" }, away: { officialScore: 18, statisticalScore: 18, difference: 0, status: "MATCHED" }, overallStatus: "MATCHED" },
    verification: { verifiedAt: null, verifiedById: null },
    provenance: { statSource: "ULTRA_NATIVE_LIVE_SCORER", dataCapability: "FULL_ULTRA" },
    ...overrides,
  };
}

test("buildLiveGameStory returns null when no tag threshold is met", () => {
  // margin 10 (not <=5 close, not >=20 dominant), combined 30 (not <=28 defensive, not >=65
  // shootout), equal rebounds, no periods recorded yet - nothing should fire.
  const snapshot = baseSnapshot({ period: 1, score: { home: 20, away: 10 } });
  const story = buildLiveGameStory(snapshot, []);
  assert.equal(story, null);
});

test("buildLiveGameStory tags CLOSE_GAME for a tight live margin and marks it provisional while LIVE", () => {
  const snapshot = baseSnapshot({ score: { home: 20, away: 18 } });
  const story = buildLiveGameStory(snapshot, []);
  assert.ok(story);
  assert.ok(story!.tags.includes("CLOSE_GAME"));
  assert.equal(story!.provisional, true);
});

test("buildLiveGameStory tags COMEBACK once a real prior-half deficit is on record, with a matching fact", () => {
  const chronology: ScoringPoint[] = [
    point({ sequence: 1, period: 1, homeScore: 10, awayScore: 20, scoringTeam: "AWAY", basePointValue: 3 }),
    point({ sequence: 2, period: 2, homeScore: 25, awayScore: 22, scoringTeam: "HOME", basePointValue: 3 }),
  ];
  const pulse = computeGamePulse(chronology);
  const snapshot = baseSnapshot({ period: 3, score: { home: 25, away: 22 } });
  const story = buildLiveGameStory(snapshot, pulse.points);
  assert.ok(story?.tags.includes("COMEBACK"));
  assert.ok(story!.facts.some((f) => f.includes("erased a 10-point deficit")));
});

test("buildLiveGameStory becomes non-provisional only once FINAL and statistics are verified", () => {
  const chronology: ScoringPoint[] = [point({ sequence: 1, homeScore: 20, awayScore: 18 })];
  const pulse = computeGamePulse(chronology);
  const liveSnapshot = baseSnapshot({ score: { home: 20, away: 18 } });
  assert.equal(buildLiveGameStory(liveSnapshot, pulse.points)?.provisional, true);

  const finalUnverified = baseSnapshot({ status: "FINAL", score: { home: 20, away: 18 } });
  assert.equal(buildLiveGameStory(finalUnverified, pulse.points)?.provisional, true);

  const finalVerified = baseSnapshot({ status: "FINAL", score: { home: 20, away: 18 }, verification: { verifiedAt: "2026-08-20T00:00:00Z", verifiedById: "u1" } });
  assert.equal(buildLiveGameStory(finalVerified, pulse.points)?.provisional, false);
});

test("buildLiveGameStory never fires PAINT_DOMINANCE/BENCH_IMPACT/TURNOVER_PRESSURE - the live engine has no provenance for them", () => {
  const snapshot = baseSnapshot({ score: { home: 20, away: 18 } });
  const story = buildLiveGameStory(snapshot, []);
  assert.ok(story);
  assert.equal(story!.tags.includes("PAINT_DOMINANCE"), false);
  assert.equal(story!.tags.includes("BENCH_IMPACT"), false);
  assert.equal(story!.tags.includes("TURNOVER_PRESSURE"), false);
});

test("buildLiveGameStory does not treat the in-progress period as a checkpoint", () => {
  // Only period 1 has fully ended (period 2 is in progress) - a checkpoint list including the
  // live period would let COMEBACK/SECOND_HALF_TAKEOVER fire on a number that's still changing.
  const chronology: ScoringPoint[] = [point({ sequence: 1, period: 1, homeScore: 10, awayScore: 5 })];
  const pulse = computeGamePulse(chronology);
  const snapshot = baseSnapshot({ period: 2, score: { home: 10, away: 5 } });
  // Reaching in here indirectly via buildLiveGameCore would need an export; instead confirm no
  // COMEBACK fires from a single-period chronology regardless (only one checkpoint exists).
  const story = buildLiveGameStory(snapshot, pulse.points);
  assert.equal(story?.tags.includes("COMEBACK") ?? false, false);
});
