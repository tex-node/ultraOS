// Live Presentation Model (G.18, Part III). The one adapter every presentation surface (public
// Game Center, broadcast dashboard, commentator panel) consumes - none of them interprets
// Snapshot V2 independently or calculates its own version of the game. Pure function, no
// database access: takes an already-built LiveGameSnapshotV2 (G.17) plus the season's existing
// official Record Book / milestone lists (already computed by analytics/records.ts and
// analytics/milestones.ts from FINAL games only) and produces one consistent presentation shape.
//
// "CANONICAL EVENTS -> ... -> LIVE SNAPSHOT V2 -> PRESENTATION MODEL -> (public/broadcast/
// commentator/graphics) -> SAME GAME TRUTH" - this file is the single point where Snapshot V2's
// numbers become display-ready text/state, never a second statistics engine.
import { ULTRA_RULES, FINAL_PERIOD } from "./game-rules";
import type { LiveGameSnapshotV2, LiveGameSnapshotEventV2, LiveLeader } from "./live-game-snapshot-v2";
import type { DerivedPlayerStats } from "./event-derived-stats";
import { checkRecordWatch, watchPlayerRecords, type RecordWatch } from "./provisional-records";
import { detectLiveMilestones, type LiveMilestone } from "./live-milestones";
import type { RecordEntry } from "./analytics/records";
import { computeGamePulse, type LiveGamePulse } from "./live-game-pulse";
import { buildLiveGameStory, type LiveGameStory } from "./live-game-story";

export type UltraTimeState =
  | { phase: "INACTIVE" }
  | { phase: "APPROACHING"; secondsUntilStart: number }
  | { phase: "ACTIVE" };

export function deriveUltraTimeState(period: number, remainingClockSeconds: number, isActive: boolean): UltraTimeState {
  if (isActive) return { phase: "ACTIVE" };
  if (period !== FINAL_PERIOD) return { phase: "INACTIVE" };
  const secondsUntilStart = remainingClockSeconds - ULTRA_RULES.ultraTimeThresholdSeconds;
  // Only surface a countdown once it's genuinely close (matches the "optionally show... when
  // the authoritative rules engine can calculate this safely" instruction - a countdown from
  // 9 minutes out isn't useful and risks looking wrong if the clock is paused/corrected).
  if (secondsUntilStart > 0 && secondsUntilStart <= 30) return { phase: "APPROACHING", secondsUntilStart };
  return { phase: "INACTIVE" };
}

export type MomentFeedEntry = {
  id: string;
  clockLabel: string;
  text: string;
  isUltraTime: boolean;
  isFourPointAttempt: boolean;
};

function clockLabel(clockSeconds: number): string {
  return `${Math.floor(clockSeconds / 60)}:${(clockSeconds % 60).toString().padStart(2, "0")}`;
}

// Spectator-friendly text, never altering the underlying event - purely a presentation
// transformation of what src/app/games/stats-actions.ts already wrote.
function describeMoment(event: LiveGameSnapshotEventV2, homeShortName: string): string {
  const who = event.playerName ?? "Team";
  const scoreSuffix = event.homeScoreAfter !== null && event.awayScoreAfter !== null
    ? ` ${homeShortName} ${event.homeScoreAfter}–${event.awayScoreAfter}`
    : "";

  switch (event.eventType) {
    case "SCORE":
    case "SCORE_CORRECTION":
    case "SHOT_MADE":
    case "FREE_THROW_MADE": {
      if (event.made === false) break;
      const shotLabel = event.basePointValue === 1 ? "a free throw" : `a ${event.basePointValue}PT`;
      const ultraSuffix = event.isUltraTime && event.multiplier ? ` ×${event.multiplier}` : "";
      return `${who} hits ${shotLabel}${ultraSuffix}.${scoreSuffix}`;
    }
    case "SHOT_MISSED":
    case "FREE_THROW_MISSED": {
      const shotLabel = event.basePointValue === 1 ? "a free throw" : `a ${event.basePointValue}PT`;
      return `${who} misses ${shotLabel}.`;
    }
    case "OFFENSIVE_REBOUND": return `${who} offensive rebound.`;
    case "DEFENSIVE_REBOUND": return `${who} defensive rebound.`;
    case "ASSIST": return `${who} assist.`;
    case "STEAL": return `${who} steal.`;
    case "BLOCK": return `${who} block.`;
    case "TURNOVER": return `${who} turnover.`;
    case "FOUL": return `${who} foul.`;
    case "SUBSTITUTION": return event.description;
    case "ULTRA_TIME_STARTED": return "ULTRA TIME begins.";
    case "ULTRA_TIME_ENDED": return "ULTRA TIME ends.";
    default: return event.description;
  }
  return event.description;
}

export function buildMomentFeed(events: LiveGameSnapshotEventV2[], homeShortName: string): MomentFeedEntry[] {
  return events
    .filter((e) => e.status === "ACTIVE")
    .map((e) => ({
      id: e.id,
      clockLabel: `P${e.period} ${clockLabel(e.clockSeconds)}`,
      text: describeMoment(e, homeShortName),
      isUltraTime: e.isUltraTime,
      isFourPointAttempt: e.isFourPointAttempt,
    }));
}

export type UltraScoringMoment = { id: string; playerName: string; basePointValue: number; multiplier: number; points: number };

export function buildUltraScoringFeed(events: LiveGameSnapshotEventV2[]): UltraScoringMoment[] {
  return events
    .filter((e) => e.status === "ACTIVE" && e.isUltraTime && e.made === true && e.basePointValue !== null && e.multiplier !== null && e.points !== null)
    .map((e) => ({ id: e.id, playerName: e.playerName ?? "Player", basePointValue: e.basePointValue!, multiplier: e.multiplier!, points: e.points! }));
}

export type TeamComparisonRow = { label: string; home: string; away: string };

// Only the categories the live event-derived engine can actually compute (Part X: "Capability-
// gate every row... Do not render meaningless zero rows for unavailable categories"). PAINT/
// BENCH/fast-break are advanced TeamStat columns only ever populated by an official PDF import
// (game-result-import.ts) - the live engine never derives them, so they're correctly omitted
// here rather than shown as a fabricated 0.
export function buildTeamComparison(snapshot: LiveGameSnapshotV2): TeamComparisonRow[] {
  const { home, away } = snapshot.liveBoxScore.teams;
  const pct = (made: number, attempted: number) => (attempted > 0 ? `${Math.round((made / attempted) * 100)}%` : "—");
  return [
    { label: "FG%", home: pct(home.fieldGoalsMade, home.fieldGoalsAttempted), away: pct(away.fieldGoalsMade, away.fieldGoalsAttempted) },
    { label: "REB", home: String(home.rebounds), away: String(away.rebounds) },
    { label: "AST", home: String(home.assists), away: String(away.assists) },
    { label: "TOV", home: String(home.turnovers), away: String(away.turnovers) },
    { label: "PF", home: String(home.fouls), away: String(away.fouls) },
  ];
}

export type FourPointBlock = { made: number; attempted: number; percent: string | null } | null;

export function buildFourPointBlock(snapshot: LiveGameSnapshotV2, seasonClubId: string): FourPointBlock {
  if (snapshot.dataCapability !== "FULL_ULTRA") return null;
  const team = seasonClubId === snapshot.teams.home.seasonClubId ? snapshot.liveBoxScore.teams.home : snapshot.liveBoxScore.teams.away;
  return {
    made: team.fourPointsMade,
    attempted: team.fourPointsAttempted,
    percent: team.fourPointsAttempted > 0 ? `${Math.round((team.fourPointsMade / team.fourPointsAttempted) * 100)}%` : null,
  };
}

export type TalkingPoint = string;

export function buildTalkingPoints(snapshot: LiveGameSnapshotV2, ultraTimeState: UltraTimeState, recordWatches: RecordWatch[]): TalkingPoint[] {
  const points: TalkingPoint[] = [];
  const { home, away } = snapshot.liveBoxScore.teams;
  const homeShort = snapshot.teams.home.shortName;
  const awayShort = snapshot.teams.away.shortName;

  if (home.rebounds !== away.rebounds) {
    const leader = home.rebounds > away.rebounds ? homeShort : awayShort;
    const [hi, lo] = home.rebounds > away.rebounds ? [home.rebounds, away.rebounds] : [away.rebounds, home.rebounds];
    if (hi > 0) points.push(`${leader} leads the rebounding battle ${hi}–${lo}.`);
  }
  if (home.fourPointsMade > 0 || away.fourPointsMade > 0) {
    points.push(`4PT makes: ${homeShort} ${home.fourPointsMade}, ${awayShort} ${away.fourPointsMade}.`);
  }
  if (ultraTimeState.phase === "APPROACHING") {
    points.push(`Ultra Time begins in ${ultraTimeState.secondsUntilStart} seconds.`);
  } else if (ultraTimeState.phase === "ACTIVE") {
    points.push("Ultra Time is active — all points are doubled.");
  }
  for (const watch of recordWatches) {
    if (watch.status === "NEW_PROVISIONAL") points.push(`${watch.recordTitle}: new Season Zero high, ${watch.liveValue} (provisional).`);
    else if (watch.status === "TIED") points.push(`${watch.recordTitle}: tied at ${watch.liveValue} (provisional).`);
    else if (watch.status === "APPROACHING") points.push(`${watch.recordTitle}: ${watch.officialValue - watch.liveValue} away from the Season Zero record.`);
  }
  return points;
}

export type LivePresentationModel = {
  gameId: string;
  fixtureId: string;
  status: string;
  isFinal: boolean;
  isStatisticsVerified: boolean;
  period: number;
  periodLabel: string;
  clock: { remainingSeconds: number; running: boolean };
  shotClock: { remainingSeconds: number; running: boolean };
  score: { home: number; away: number };
  teams: LiveGameSnapshotV2["teams"];
  ultraTime: UltraTimeState;
  ultraScoringFeed: UltraScoringMoment[];
  fourPoint: { home: FourPointBlock; away: FourPointBlock };
  leaders: LiveLeader[];
  // G.19 Part XIV: the Player Spotlight graphic needs a per-player stat line beyond just the
  // per-category leaders. Passed straight through from Snapshot V2's already-computed live box
  // score, same as `leaders` above - not a new calculation.
  players: DerivedPlayerStats[];
  teamComparison: TeamComparisonRow[];
  momentFeed: MomentFeedEntry[];
  // G.20: the raw, sequenced event list (not the display-formatted moment feed) - needed by the
  // public API's /events route, which needs real sequence/period/clock/player/club fields rather
  // than a pre-formatted sentence. Passed straight through from Snapshot V2, same pattern as
  // `leaders`/`players` above - not a second event source.
  latestEvents: LiveGameSnapshotEventV2[];
  currentLineups: LiveGameSnapshotV2["currentLineups"];
  minutes: LiveGameSnapshotV2["minutes"];
  recordWatches: RecordWatch[];
  liveMilestones: LiveMilestone[];
  talkingPoints: TalkingPoint[];
  gamePulse: LiveGamePulse;
  gameStory: LiveGameStory | null;
  dataCapability: LiveGameSnapshotV2["dataCapability"];
  reconciliation: LiveGameSnapshotV2["reconciliation"];
  provenance: LiveGameSnapshotV2["provenance"];
};

export function buildLivePresentationModel(snapshot: LiveGameSnapshotV2, officialPlayerRecords: RecordEntry[] = []): LivePresentationModel {
  const ultraTime = deriveUltraTimeState(snapshot.period, snapshot.clock.remainingSeconds, snapshot.isUltraTimeActive);
  const recordWatches = snapshot.liveBoxScore.players.flatMap((p) => watchPlayerRecords(p, officialPlayerRecords));
  const liveMilestones = detectLiveMilestones(snapshot.liveBoxScore.players);
  const gamePulse = computeGamePulse(snapshot.scoringChronology);
  const gameStory = buildLiveGameStory(snapshot, gamePulse.points);

  return {
    gameId: snapshot.gameId,
    fixtureId: snapshot.fixtureId,
    status: snapshot.status,
    isFinal: snapshot.status === "FINAL",
    isStatisticsVerified: snapshot.verification.verifiedAt !== null,
    period: snapshot.period,
    periodLabel: snapshot.periodLabel,
    clock: snapshot.clock,
    shotClock: snapshot.shotClock,
    score: snapshot.score,
    teams: snapshot.teams,
    ultraTime,
    ultraScoringFeed: buildUltraScoringFeed(snapshot.latestEvents),
    fourPoint: {
      home: buildFourPointBlock(snapshot, snapshot.teams.home.seasonClubId),
      away: buildFourPointBlock(snapshot, snapshot.teams.away.seasonClubId),
    },
    leaders: snapshot.leaders,
    players: snapshot.liveBoxScore.players,
    teamComparison: buildTeamComparison(snapshot),
    momentFeed: buildMomentFeed(snapshot.latestEvents, snapshot.teams.home.shortName),
    latestEvents: snapshot.latestEvents,
    currentLineups: snapshot.currentLineups,
    minutes: snapshot.minutes,
    recordWatches,
    liveMilestones,
    talkingPoints: buildTalkingPoints(snapshot, ultraTime, recordWatches),
    gamePulse,
    gameStory,
    dataCapability: snapshot.dataCapability,
    reconciliation: snapshot.reconciliation,
    provenance: snapshot.provenance,
  };
}

// Part XVI, Stage 18: a record only becomes official once GAME=FINAL and STATISTICS=VERIFIED.
// Exposed as a pure predicate so both the record engine and any UI can share the exact same
// promotion rule, tested explicitly.
export function canPromoteToOfficialRecord(status: string, statisticsVerifiedAt: string | null): boolean {
  return status === "FINAL" && statisticsVerifiedAt !== null;
}

export { checkRecordWatch };
