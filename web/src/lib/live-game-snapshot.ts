// Stable internal read model for "what is this live game's current state" (Part XXVII). Pure
// function - no Prisma - so scorer, statistician, public /live, and broadcast surfaces can all
// build the same shape from their own already-fetched data instead of independently
// re-deriving clock/reconciliation/capability logic (or querying raw event/stat tables
// themselves and drifting apart). Deliberately does not duplicate the full team/player box
// score already served by /api/games/[id]/box-score - composes score/clock/reconciliation/
// recent-events, the parts that endpoint doesn't cover, rather than re-deriving what it does.
import { getGameAnalyticsCapability, type GameAnalyticsCapability, type GameDataCapability } from "@/lib/game-data-capability";
import { periodLabel } from "@/lib/game-rules";
import { reconcileGameScore, type GameReconciliation } from "@/lib/reconciliation";
import { replayScore, type ReplayableEvent } from "@/lib/ultra-scoring-engine";

export type LiveGameSnapshotEvent = {
  id: string;
  eventType: string;
  description: string;
  period: number;
  clockSeconds: number;
  sequenceNumber: number | null;
  source: string | null;
  status: string;
};

export type LiveGameSnapshot = {
  gameId: string;
  status: string;
  period: number;
  periodLabel: string;
  clock: { remainingSeconds: number; running: boolean };
  shotClock: { remainingSeconds: number; running: boolean };
  isUltraTimeActive: boolean;
  dataCapability: GameAnalyticsCapability;
  score: { home: number; away: number };
  reconciliation: GameReconciliation;
  recentEvents: LiveGameSnapshotEvent[];
};

export function buildLiveGameSnapshot(input: {
  gameId: string;
  status: string;
  currentPeriod: number;
  remainingClockSeconds: number;
  clockRunning: boolean;
  remainingShotClockSeconds: number;
  shotClockRunning: boolean;
  isUltraTimeActive: boolean;
  dataCapability: GameDataCapability;
  homeSeasonClubId: string;
  awaySeasonClubId: string;
  officialHomeScore: number;
  officialAwayScore: number;
  statisticianEvents: ReplayableEvent[];
  recentEvents: LiveGameSnapshotEvent[];
}): LiveGameSnapshot {
  const hasStatisticianEvents = input.statisticianEvents.length > 0;
  const { homeScore: statisticalHome, awayScore: statisticalAway } = replayScore(
    input.statisticianEvents,
    input.homeSeasonClubId!,
    input.awaySeasonClubId!,
  );
  const reconciliation = reconcileGameScore(
    input.officialHomeScore,
    input.officialAwayScore,
    statisticalHome,
    statisticalAway,
    hasStatisticianEvents,
  );

  return {
    gameId: input.gameId,
    status: input.status,
    period: input.currentPeriod,
    periodLabel: periodLabel(input.currentPeriod, input.status),
    clock: { remainingSeconds: input.remainingClockSeconds, running: input.clockRunning },
    shotClock: { remainingSeconds: input.remainingShotClockSeconds, running: input.shotClockRunning },
    isUltraTimeActive: input.isUltraTimeActive,
    dataCapability: getGameAnalyticsCapability(input.dataCapability),
    score: { home: input.officialHomeScore, away: input.officialAwayScore },
    reconciliation,
    recentEvents: input.recentEvents,
  };
}
