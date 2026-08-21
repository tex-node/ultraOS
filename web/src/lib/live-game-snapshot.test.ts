import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveGameSnapshot } from "./live-game-snapshot";

const BASE = {
  gameId: "game_1",
  status: "LIVE",
  currentPeriod: 2,
  remainingClockSeconds: 300,
  clockRunning: true,
  remainingShotClockSeconds: 14,
  shotClockRunning: true,
  isUltraTimeActive: false,
  dataCapability: "ULTRA_NATIVE_EVENTS" as const,
  homeSeasonClubId: "home",
  awaySeasonClubId: "away",
  officialHomeScore: 40,
  officialAwayScore: 38,
  recentEvents: [],
};

test("buildLiveGameSnapshot reports UNAVAILABLE reconciliation when no statistician events exist yet", () => {
  const snapshot = buildLiveGameSnapshot({ ...BASE, statisticianEvents: [] });
  assert.equal(snapshot.reconciliation.overallStatus, "UNAVAILABLE");
  assert.equal(snapshot.score.home, 40);
  assert.equal(snapshot.score.away, 38);
  assert.equal(snapshot.dataCapability, "FULL_ULTRA");
});

test("buildLiveGameSnapshot derives MATCHED reconciliation from a replayed statistician ledger", () => {
  const snapshot = buildLiveGameSnapshot({
    ...BASE,
    statisticianEvents: [
      { seasonClubId: "home", points: 40, status: "ACTIVE" },
      { seasonClubId: "away", points: 38, status: "ACTIVE" },
      { seasonClubId: "home", points: 100, status: "VOIDED" }, // excluded from replay
    ],
  });
  assert.equal(snapshot.reconciliation.overallStatus, "MATCHED");
});

test("buildLiveGameSnapshot exposes clock/period/Ultra Time state without re-deriving them", () => {
  const snapshot = buildLiveGameSnapshot({ ...BASE, statisticianEvents: [], isUltraTimeActive: true, currentPeriod: 2, status: "LIVE" });
  assert.equal(snapshot.isUltraTimeActive, true);
  assert.equal(snapshot.period, 2);
  assert.equal(snapshot.periodLabel, "HALF 2");
  assert.equal(snapshot.clock.remainingSeconds, 300);
  assert.equal(snapshot.shotClock.running, true);
});
