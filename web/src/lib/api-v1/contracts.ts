// Public API v1 response contracts (G.20, Part XVI-XVII, XIX, XXIV-XXV). Explicit types with
// only the fields a public consumer should ever see - never a spread of a raw Prisma row, so a
// private field can't leak just because a model gained a new column later. Every builder here is
// pure (already-fetched plain data in, a plain response shape out); the Prisma/session-touching
// work happens in each route file.
//
// Versioning policy (Part XVII): v1 fields are stable once shipped. `points` always means
// effective awarded points (post-Ultra-Time-multiplier); `basePointValue` always retains the
// original shot value (2/3/4); `multiplier` always retains the rules multiplier applied (1 or 2).
// New OPTIONAL fields may be added to any v1 response without notice. Any field's existing
// meaning changing, or a field being removed, requires a v2 namespace - never a silent change to
// v1's existing semantics.
import type { GameAnalyticsCapability } from "@/lib/game-data-capability";

export type ClubRefV1 = { publicId: string; name: string; shortName: string };
export type PlayerRefV1 = { publicId: string | null; name: string };

export type ScoreV1 = { home: number; away: number };
export type ClockV1 = { remainingSeconds: number; running: boolean };
export type UltraTimeV1 = { active: boolean; approaching: boolean; secondsUntilStart: number | null };

export type LiveGameV1 = {
  fixtureId: string;
  gameId: string;
  status: string;
  home: ClubRefV1;
  away: ClubRefV1;
  score: ScoreV1;
  period: number;
  periodLabel: string;
  clock: ClockV1;
  shotClock: ClockV1;
  ultraTime: UltraTimeV1;
  capability: GameAnalyticsCapability;
  generatedAt: string;
  dataUpdatedAt: string;
};

export type LeaderV1 = { category: string; player: PlayerRefV1; club: ClubRefV1; value: number };
export type TeamComparisonRowV1 = { label: string; home: string; away: string };

export type EventV1 = {
  sequence: number | null;
  period: number;
  clockSeconds: number;
  club: ClubRefV1 | null;
  player: PlayerRefV1 | null;
  eventType: string;
  basePointValue: number | null;
  multiplier: number | null;
  points: number | null;
};

export type GameSnapshotV1 = {
  fixtureId: string;
  gameId: string;
  status: string;
  home: ClubRefV1;
  away: ClubRefV1;
  score: ScoreV1;
  period: number;
  periodLabel: string;
  clock: ClockV1;
  shotClock: ClockV1;
  ultraTime: UltraTimeV1;
  capability: GameAnalyticsCapability;
  leaders: LeaderV1[];
  teamComparison: TeamComparisonRowV1[];
  // Part XIX: null (not []) for a capability tier where an event history was never captured -
  // an empty array would dishonestly imply "captured, and nothing happened."
  recentEvents: EventV1[] | null;
  verification: { verified: boolean };
  generatedAt: string;
  dataUpdatedAt: string;
};

export type BoxScorePlayerV1 = {
  player: PlayerRefV1;
  club: ClubRefV1;
  points: number; rebounds: number; assists: number; steals: number; blocks: number; turnovers: number; fouls: number;
  fieldGoalsMade: number; fieldGoalsAttempted: number;
  fourPointsMade: number; fourPointsAttempted: number;
};

export type BoxScoreV1 = {
  fixtureId: string;
  gameId: string;
  status: string;
  capability: GameAnalyticsCapability;
  home: ClubRefV1 & { score: number };
  away: ClubRefV1 & { score: number };
  players: BoxScorePlayerV1[];
  generatedAt: string;
  dataUpdatedAt: string;
};

export type PlayerSummaryV1 = {
  publicId: string;
  name: string;
  position: string;
  jerseyNumber: number | null;
  club: ClubRefV1 | null;
  generatedAt: string;
};

export type ClubSummaryV1 = {
  publicId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  division: string;
  record: { played: number; won: number; lost: number; pointsFor: number; pointsAgainst: number; pointDifference: number; leaguePoints: number } | null;
  generatedAt: string;
};

export type StandingV1 = {
  club: ClubRefV1;
  division: string;
  played: number; won: number; lost: number;
  pointsFor: number; pointsAgainst: number; pointDifference: number; leaguePoints: number;
};

export type SeasonStandingsV1 = { seasonPublicId: string; standings: StandingV1[]; generatedAt: string };
export type SeasonLeadersV1 = { seasonPublicId: string; category: string; leaders: LeaderV1[]; generatedAt: string };

// A FINAL game can still carry a stale `shotClockStartedAt` from whenever the clock was last
// touched (the write path never clears it on finalize - a pre-existing quirk of the underlying
// scorer model, not introduced here) - honest for a public consumer means a finished game never
// reports either clock as "running," regardless of what the stored flag says.
export function honestClock(status: string, clock: ClockV1): ClockV1 {
  return status === "FINAL" ? { ...clock, running: false } : clock;
}

// A public-safe club slug: Club.shortName lowercased. Unique per sport (@@unique([sportId,
// shortName]) in schema.prisma) and, since this league has exactly one sport, globally unique in
// practice - a real, human-readable stable identifier, not a database id (Part XV).
export function clubPublicId(shortName: string): string {
  return shortName.toLowerCase();
}
