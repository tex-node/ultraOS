export type GameStatusValue =
  | "NOT_STARTED"
  | "LIVE"
  | "FINAL"
  | "CANCELLED"
  | "POSTPONED";

export interface LocalGame {
  id: string;
  organizationId: string;
  fixtureId: string;
  status: GameStatusValue;
  currentPeriod: number;
  clockSecondsRemaining: number;
  clockStartedAt: string | null;
  shotClockSecondsRemaining: number;
  shotClockStartedAt: string | null;
  isUltraTimeActive: boolean;
  nextEventSequence: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  clientUpdatedAt: string;
}

export interface LocalGameEvent {
  id: string;
  organizationId: string;
  gameId: string;
  sequenceNumber: number | null;
  seasonClubId: string | null;
  entrantId: string | null;
  playerId: string | null;
  fouledPlayerId: string | null;
  foulType: string | null;
  causedByEventId: string | null;
  eventType: string;
  typeKey: string | null;
  data: unknown;
  points: number | null;
  basePointValue: number | null;
  multiplier: number | null;
  made: boolean | null;
  isFourPointAttempt: boolean;
  isUltraTime: boolean;
  assistedByPlayerId: string | null;
  substitutedOutPlayerId: string | null;
  x: number | null;
  y: number | null;
  courtZone: string | null;
  homeScoreBefore: number | null;
  awayScoreBefore: number | null;
  homeScoreAfter: number | null;
  awayScoreAfter: number | null;
  source: string | null;
  createdById: string | null;
  status: string;
  period: number;
  clockSeconds: number;
  description: string;
  createdAt: string;
  clientUpdatedAt: string;
}

export interface LocalPlayerStat {
  id: string;
  organizationId: string;
  gameId: string;
  playerId: string;
  seasonClubId: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  minutesPlayed: number;
  statSource: string | null;
  updatedAt: string;
  clientUpdatedAt: string;
}
