// Live Snapshot V2 (G.17, Part X). The single consolidated read model for a live/recently-final
// game - composes the trusted domain primitives already built across G.15-G.17 rather than
// recomputing any of them a second way: event-derived-stats.ts (box score), lineup.ts +
// lineup-stints.ts (lineups/minutes), reconciliation.ts (score reconciliation), player-analytics.ts
// (efficiency - the exact same formula historical Game Star uses), game-data-capability.ts
// (capability tier).
//
// Unlike live-game-snapshot.ts (V1, G.15), this is intentionally the one file allowed to touch
// Prisma for this concern - V1's "stay pure, let the caller fetch" approach doesn't scale to the
// dozen-plus independent data sources V2 composes without an unwieldy parameter list. This
// mirrors the same "one Prisma-touching composition point" convention game-analytics.ts already
// established for historical analytics.
import { prisma } from "@/lib/prisma";
import { getGameAnalyticsCapability, type GameAnalyticsCapability } from "@/lib/game-data-capability";
import { periodLabel } from "@/lib/game-rules";
import { remainingClockSeconds } from "@/lib/game-clock";
import { remainingShotClockSeconds } from "@/lib/game-rules";
import { reconcileGameScore, type GameReconciliation } from "@/lib/reconciliation";
import { effectiveRuleSnapshot, isUltraTimeUnderRules } from "@/lib/ultra-scoring-engine";
import {
  derivePlayerStats, deriveTeamStats, deriveTeamScore, emptyTeamStats,
  type DerivableEvent, type DerivedPlayerStats, type DerivedTeamStats,
} from "@/lib/event-derived-stats";
import { deriveLineup } from "@/lib/lineup";
import { verifyTeamMinutes, type SubstitutionWithClock, type MinutesIntegrityResult } from "@/lib/lineup-stints";
import { efficiencyProxy } from "@/lib/analytics/player-analytics";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import { buildPlayerSingleGameRecords } from "@/lib/analytics/records";
import { buildLivePresentationModel } from "@/lib/live-presentation-model";
import type { ScoringPoint } from "@/lib/live-game-pulse";

const STAT_SOURCE = "ULTRA_NATIVE_LIVE_STATISTICIAN" as const;

export type LiveLeaderCategory = "POINTS" | "REBOUNDS" | "ASSISTS" | "STEALS" | "BLOCKS" | "FOUR_POINTERS" | "EFFICIENCY";

export type LiveLeader = { category: LiveLeaderCategory; playerId: string; seasonClubId: string; value: number };

export type LiveGameSnapshotEventV2 = {
  id: string; eventType: string; description: string; period: number; clockSeconds: number;
  sequenceNumber: number | null; source: string | null; status: string;
  playerId: string | null; playerName: string | null; seasonClubId: string | null;
  basePointValue: number | null; multiplier: number | null; points: number | null;
  made: boolean | null; isUltraTime: boolean; isFourPointAttempt: boolean;
  homeScoreAfter: number | null; awayScoreAfter: number | null;
};

// Deliberately excludes `scoringTimeline`, `provisionalRecords`, and `provisionalMilestones`
// from the shape the G.17 brief sketched. Building those against a live game that essentially
// never runs in production yet (one native game exists, with no player attribution and no
// statistician events) would be presentation work validated against nothing real - the same
// judgment call G.16 made deferring public/broadcast live surfaces. The fields that ARE here
// (box score, leaders, lineups, minutes, reconciliation, verification) are all backed by
// primitives already proven against real production data and the G.17 rehearsal.
export type LiveGameSnapshotV2 = {
  gameId: string;
  fixtureId: string;
  status: string;
  period: number;
  periodLabel: string;
  clock: { remainingSeconds: number; running: boolean };
  shotClock: { remainingSeconds: number; running: boolean };
  isUltraTimeActive: boolean;
  dataCapability: GameAnalyticsCapability;
  score: { home: number; away: number };
  teams: { home: { seasonClubId: string; shortName: string; name: string }; away: { seasonClubId: string; shortName: string; name: string } };
  liveBoxScore: { players: DerivedPlayerStats[]; teams: { home: DerivedTeamStats; away: DerivedTeamStats } };
  leaders: LiveLeader[];
  startingFiveConfirmed: { home: boolean; away: boolean };
  currentLineups: { home: string[]; away: string[] } | null;
  minutes: { home: MinutesIntegrityResult; away: MinutesIntegrityResult } | null;
  latestEvents: LiveGameSnapshotEventV2[];
  // G.19 Part IX: the FULL ordered scoring chronology (not just the latest 15 `latestEvents`),
  // for Game Pulse's lead-change/run/largest-lead reduction. Deliberately a separate, narrower
  // field rather than removing the `take: 15` cap on latestEvents - the moment feed only ever
  // needs a handful of recent entries, while pulse needs every scoring point from tip-off.
  scoringChronology: ScoringPoint[];
  reconciliation: GameReconciliation;
  verification: { verifiedAt: string | null; verifiedById: string | null };
  provenance: { statSource: string | null; dataCapability: GameAnalyticsCapability };
};

function computeLeaders(players: DerivedPlayerStats[]): LiveLeader[] {
  const leaders: LiveLeader[] = [];
  function top(category: LiveLeaderCategory, valueOf: (p: DerivedPlayerStats) => number) {
    if (players.length === 0) return;
    const best = players.reduce((a, b) => (valueOf(b) > valueOf(a) ? b : a));
    if (valueOf(best) > 0) leaders.push({ category, playerId: best.playerId, seasonClubId: best.seasonClubId, value: valueOf(best) });
  }
  top("POINTS", (p) => p.points);
  top("REBOUNDS", (p) => p.rebounds);
  top("ASSISTS", (p) => p.assists);
  top("STEALS", (p) => p.steals);
  top("BLOCKS", (p) => p.blocks);
  top("FOUR_POINTERS", (p) => p.fourPointsMade);
  top("EFFICIENCY", (p) => efficiencyProxy(p));
  return leaders;
}

export async function buildLiveGameSnapshotV2(gameId: string): Promise<LiveGameSnapshotV2> {
  const game = await prisma.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } }, ruleSnapshot: true },
  });

  const [statisticianEvents, latestEvents, starters, substitutionRows, scoringChronologyRows] = await Promise.all([
    prisma.gameEvent.findMany({
      where: { gameId, source: STAT_SOURCE, status: "ACTIVE" },
      orderBy: { sequenceNumber: "asc" },
      select: { eventType: true, status: true, seasonClubId: true, playerId: true, points: true, basePointValue: true, isUltraTime: true },
    }) as Promise<DerivableEvent[]>,
    prisma.gameEvent.findMany({
      where: { gameId, status: "ACTIVE" },
      orderBy: [{ sequenceNumber: "desc" }, { createdAt: "desc" }],
      take: 15,
      select: {
        id: true, eventType: true, description: true, period: true, clockSeconds: true, sequenceNumber: true, source: true, status: true,
        playerId: true, seasonClubId: true, basePointValue: true, multiplier: true, points: true, made: true, isUltraTime: true, isFourPointAttempt: true,
        homeScoreAfter: true, awayScoreAfter: true,
        player: { select: { athlete: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.gameStarter.findMany({ where: { gameId }, select: { seasonClubId: true, playerId: true } }),
    prisma.gameEvent.findMany({
      where: { gameId, eventType: "SUBSTITUTION", status: "ACTIVE" },
      orderBy: { sequenceNumber: "asc" },
      select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true, period: true, clockSeconds: true },
    }),
    // G.19 Part IX: every made, score-changing event in order - Game Pulse's only data source.
    // Filtered at the query level on `made: true` + both running-score fields present, so a
    // missed shot or a non-scoring event (rebound, foul, substitution) is never mistaken for a
    // scoring point.
    prisma.gameEvent.findMany({
      where: { gameId, status: "ACTIVE", made: true, homeScoreAfter: { not: null }, awayScoreAfter: { not: null } },
      orderBy: { sequenceNumber: "asc" },
      select: { sequenceNumber: true, period: true, clockSeconds: true, homeScoreAfter: true, awayScoreAfter: true, seasonClubId: true, basePointValue: true, multiplier: true, isUltraTime: true },
    }),
  ]);

  const homeId = game.fixture.homeSeasonClubId;
  const awayId = game.fixture.awaySeasonClubId;

  const playerStatsMap = derivePlayerStats(statisticianEvents);
  const teamStatsMap = deriveTeamStats(playerStatsMap);
  const liveBoxScore = {
    players: [...playerStatsMap.values()],
    teams: { home: teamStatsMap.get(homeId) ?? emptyTeamStats(homeId), away: teamStatsMap.get(awayId) ?? emptyTeamStats(awayId) },
  };

  const hasStatisticianEvents = statisticianEvents.length > 0;
  const reconciliation = reconcileGameScore(
    game.fixture.homeScore, game.fixture.awayScore,
    deriveTeamScore(teamStatsMap, homeId), deriveTeamScore(teamStatsMap, awayId),
    hasStatisticianEvents,
  );

  const startingFiveConfirmed = { home: starters.some((s) => s.seasonClubId === homeId), away: starters.some((s) => s.seasonClubId === awayId) };
  const bothConfirmed = startingFiveConfirmed.home && startingFiveConfirmed.away;

  const lineup = bothConfirmed
    ? deriveLineup(
        starters.map((s) => ({ seasonClubId: s.seasonClubId, playerId: s.playerId })),
        substitutionRows
          .filter((s): s is typeof s & { seasonClubId: string; playerId: string; substitutedOutPlayerId: string; sequenceNumber: number } =>
            Boolean(s.seasonClubId && s.playerId && s.substitutedOutPlayerId && s.sequenceNumber !== null))
          .map((s) => ({ seasonClubId: s.seasonClubId, playerInId: s.playerId, playerOutId: s.substitutedOutPlayerId, sequenceNumber: s.sequenceNumber })),
      )
    : null;
  const currentLineups = lineup ? { home: [...(lineup.get(homeId) ?? [])], away: [...(lineup.get(awayId) ?? [])] } : null;

  let minutes: LiveGameSnapshotV2["minutes"] = null;
  if (bothConfirmed) {
    const substitutionsWithClock: SubstitutionWithClock[] = substitutionRows
      .filter((s): s is typeof s & { seasonClubId: string; playerId: string; substitutedOutPlayerId: string; sequenceNumber: number } =>
        Boolean(s.seasonClubId && s.playerId && s.substitutedOutPlayerId && s.sequenceNumber !== null))
      .map((s) => ({ seasonClubId: s.seasonClubId, playerInId: s.playerId, playerOutId: s.substitutedOutPlayerId, sequenceNumber: s.sequenceNumber, period: s.period, clockSeconds: s.clockSeconds }));
    const gameEnd = { period: game.currentPeriod, clockSeconds: remainingClockSeconds(game) };
    const startersEntries = starters.map((s) => ({ seasonClubId: s.seasonClubId, playerId: s.playerId }));
    minutes = {
      home: verifyTeamMinutes(homeId, startersEntries, substitutionsWithClock, gameEnd),
      away: verifyTeamMinutes(awayId, startersEntries, substitutionsWithClock, gameEnd),
    };
  }

  const capability = getGameAnalyticsCapability(game.dataCapability);
  const remainingSeconds = remainingClockSeconds(game);
  // Derived fresh from clock/period/status via the same authoritative primitive the scorer's
  // own write path uses (ultra-scoring-engine.ts), never trusted from the stored
  // Game.isUltraTimeActive flag directly. That flag is only synced by syncUltraTimeState() when
  // a SCORING action happens near the boundary - a game that crosses into Ultra Time with no
  // scoring event yet (e.g. a rebound or a few seconds of no action) would read stale/false from
  // the stored flag alone. Recomputing here is what "derive Ultra Time from authoritative
  // rules/clock state, never manually duplicate its truth in the presentation layer" (G.18 Part
  // XII) actually requires - found by the G.18 rehearsal, not assumed safe.
  const isUltraTimeActive = isUltraTimeUnderRules(effectiveRuleSnapshot(game.ruleSnapshot), game.status, game.currentPeriod, remainingSeconds);

  const scoringChronology: ScoringPoint[] = scoringChronologyRows
    .filter((e): e is typeof e & { sequenceNumber: number; homeScoreAfter: number; awayScoreAfter: number; seasonClubId: string; basePointValue: number } =>
      e.sequenceNumber !== null && e.homeScoreAfter !== null && e.awayScoreAfter !== null && e.seasonClubId !== null && e.basePointValue !== null)
    .map((e) => ({
      sequence: e.sequenceNumber, period: e.period, clockSeconds: e.clockSeconds,
      homeScore: e.homeScoreAfter, awayScore: e.awayScoreAfter,
      scoringTeam: (e.seasonClubId === homeId ? "HOME" : "AWAY") as "HOME" | "AWAY",
      basePointValue: e.basePointValue, multiplier: e.multiplier ?? 1, isUltraTime: e.isUltraTime,
    }));

  return {
    gameId: game.id,
    fixtureId: game.fixtureId,
    status: game.status,
    period: game.currentPeriod,
    periodLabel: periodLabel(game.currentPeriod, game.status),
    clock: { remainingSeconds, running: Boolean(game.clockStartedAt) },
    shotClock: { remainingSeconds: remainingShotClockSeconds(game), running: Boolean(game.shotClockStartedAt) },
    isUltraTimeActive,
    dataCapability: capability,
    score: { home: game.fixture.homeScore, away: game.fixture.awayScore },
    teams: {
      home: { seasonClubId: homeId, shortName: game.fixture.homeSeasonClub.club.shortName, name: game.fixture.homeSeasonClub.club.name },
      away: { seasonClubId: awayId, shortName: game.fixture.awaySeasonClub.club.shortName, name: game.fixture.awaySeasonClub.club.name },
    },
    liveBoxScore,
    leaders: computeLeaders(liveBoxScore.players),
    startingFiveConfirmed,
    currentLineups,
    minutes,
    latestEvents: latestEvents.map((e) => ({
      id: e.id, eventType: e.eventType, description: e.description, period: e.period, clockSeconds: e.clockSeconds,
      sequenceNumber: e.sequenceNumber, source: e.source, status: e.status,
      playerId: e.playerId, seasonClubId: e.seasonClubId,
      playerName: e.player ? `${e.player.athlete.firstName} ${e.player.athlete.lastName}` : null,
      basePointValue: e.basePointValue, multiplier: e.multiplier, points: e.points, made: e.made,
      isUltraTime: e.isUltraTime, isFourPointAttempt: e.isFourPointAttempt,
      homeScoreAfter: e.homeScoreAfter, awayScoreAfter: e.awayScoreAfter,
    })),
    scoringChronology,
    reconciliation,
    verification: { verifiedAt: game.statisticsVerifiedAt?.toISOString() ?? null, verifiedById: game.statisticsVerifiedById },
    provenance: { statSource: game.statSource, dataCapability: capability },
  };
}

// G.18 convenience composition: builds the snapshot, loads the season's existing official
// single-game Record Book (from FINAL games only, via the unchanged G.9-G.14 analytics
// pipeline), and hands both to the pure buildLivePresentationModel() adapter. This is the one
// call public/broadcast/commentator pages need - none of them touches Prisma or Snapshot V2
// directly themselves.
export async function buildLivePresentationModelForGame(gameId: string) {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, include: { fixture: true } });
  const [snapshot, seasonGames] = await Promise.all([
    buildLiveGameSnapshotV2(gameId),
    loadSeasonGameCores(game.fixture.seasonId),
  ]);
  const officialPlayerRecords = buildPlayerSingleGameRecords(seasonGames);
  return buildLivePresentationModel(snapshot, officialPlayerRecords);
}
