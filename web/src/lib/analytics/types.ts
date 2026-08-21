import type { GameDataCapability } from "@/lib/game-data-capability";

// Plain-data shapes the analytics domain layer operates on. Deliberately decoupled from
// Prisma's generated types so every function here is a pure function of plain data — testable
// without a database, and reusable from the website, broadcast API, and future social-graphic
// rendering from the exact same inputs. `game-analytics.ts` is the only file that touches
// Prisma; everything else in this directory takes/returns these shapes.

export type TeamSide = "HOME" | "AWAY";

export type TeamSideStats = {
  seasonClubId: string;
  shortName: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  score: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  fouls: number;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  twoPointsMade: number | null;
  twoPointsAttempted: number | null;
  threePointsMade: number | null;
  threePointsAttempted: number | null;
  freeThrowsMade: number | null;
  freeThrowsAttempted: number | null;
  offensiveRebounds: number | null;
  defensiveRebounds: number | null;
  pointsFromTurnovers: number | null;
  pointsInPaint: number | null;
  pointsInPaintMade: number | null;
  pointsInPaintAttempted: number | null;
  secondChancePoints: number | null;
  fastBreakPoints: number | null;
  fastBreakPointsFromTurnovers: number | null;
  benchPoints: number | null;
  biggestLead: number | null;
  biggestScoringRun: number | null;
  pointsPerPossession: number | null;
  leadChanges: number | null;
  timesTied: number | null;
  timeWithLeadSeconds: number | null;
  fourPointsMade: number | null;
  fourPointsAttempted: number | null;
  ultraTimePointsFor: number | null;
  ultraTimePointsAgainst: number | null;
};

export type PlayerLine = {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  photoUrl: string | null;
  seasonClubId: string;
  seasonClubShortName: string;
  side: TeamSide;
  didNotPlay: boolean;
  minutesPlayed: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  twoPointsMade: number | null;
  twoPointsAttempted: number | null;
  threePointsMade: number | null;
  threePointsAttempted: number | null;
  freeThrowsMade: number | null;
  freeThrowsAttempted: number | null;
  offensiveRebounds: number | null;
  defensiveRebounds: number | null;
  foulsDrawn: number | null;
  plusMinus: number | null;
  efficiency: number | null;
  fourPointsMade: number | null;
  fourPointsAttempted: number | null;
  ultraTimePoints: number | null;
};

export type PeriodScoreLine = { period: number; label: string; homeScore: number; awayScore: number };

export type GameCore = {
  gameId: string;
  fixtureId: string;
  status: string;
  dataCapability: GameDataCapability;
  divisionName: string;
  scheduledAt: Date;
  home: TeamSideStats;
  away: TeamSideStats;
  players: PlayerLine[];
  periods: PeriodScoreLine[];
};

export type GameStoryTag =
  | "CLOSE_GAME"
  | "OVERTIME"
  | "COMEBACK"
  | "WIRE_TO_WIRE"
  | "DOMINANT"
  | "SECOND_HALF_TAKEOVER"
  | "SHOOTOUT"
  | "DEFENSIVE_BATTLE"
  | "BENCH_IMPACT"
  | "PAINT_DOMINANCE"
  | "TURNOVER_PRESSURE"
  | "PERIMETER_EDGE"
  | "REBOUNDING_EDGE";

export type Insight = { text: string };

export type WhyTheyWonFactor = {
  key: string;
  label: string;
  winnerValue: string;
  loserValue: string;
  separation: number;
};

export type PerformerCategory =
  | "GAME_STAR"
  | "TOP_SCORER"
  | "TOP_REBOUNDER"
  | "TOP_PLAYMAKER"
  | "TOP_DEFENDER"
  | "MOST_EFFICIENT"
  | "BENCH_SPARK";

export type TopPerformer = {
  category: PerformerCategory;
  player: PlayerLine;
  headline: string;
};

export type BadgeKey =
  | "GAME_STAR"
  | "SNIPER"
  | "PERFECT_SHOOTING"
  | "GLASS_CLEANER"
  | "PLAYMAKER"
  | "LOCKDOWN"
  | "BENCH_SPARK"
  | "PAINT_BEAST"
  | "HIGH_EFFICIENCY";

export type QualificationState = "INSUFFICIENT_SAMPLE" | "DEVELOPING_PROFILE" | "QUALIFIED";
