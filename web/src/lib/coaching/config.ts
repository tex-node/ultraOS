// ADR-011: every coaching threshold lives here, never inline. Gates are calibrated for the short
// Ultra format (2x10-minute halves) and early-season samples, so they are lower than full-length
// basketball norms; raise them as seasons get longer.

export type DevelopmentDimensionKey =
  | "SCORING_EFFICIENCY"
  | "FREE_THROWS"
  | "THREE_POINT"
  | "FOUR_POINT"
  | "PLAYMAKING"
  | "BALL_SECURITY"
  | "REBOUNDING"
  | "DEFENSIVE_ACTIVITY"
  | "FOUL_DISCIPLINE";

export type PositionGroup = "GUARD" | "WING" | "BIG" | "UNKNOWN";

export type Confidence = "HIGH" | "MEDIUM";

export const DEVELOPMENT_DIMENSION_LABEL: Record<DevelopmentDimensionKey, string> = {
  SCORING_EFFICIENCY: "Scoring efficiency",
  FREE_THROWS: "Free throws",
  THREE_POINT: "Three-point shooting",
  FOUR_POINT: "Four-point shooting",
  PLAYMAKING: "Playmaking",
  BALL_SECURITY: "Ball security",
  REBOUNDING: "Rebounding",
  DEFENSIVE_ACTIVITY: "Defensive activity",
  FOUL_DISCIPLINE: "Foul discipline",
};

export const developmentConfig = {
  // A player needs this many games played before ANY dimension can be assessed.
  minGames: 4,
  // A player qualifies for PER-GAME dimensions only if their mean minutes are at least this share
  // of a game's length, where game length = (sum of the team's player minutes) / 5. 0.25 is 10 mpg
  // in a 40-minute game and 5 mpg in a 20-minute game, so it carries across formats (LBCL 4x10,
  // Ultra 2x10). Games with no minutes recorded are ignored by the gate.
  minMinutesShare: 0.25,
  // Attempt gates for percentage dimensions. Scoring efficiency uses true-shooting attempts
  // (FGA + 0.44 x FTA).
  attemptGates: {
    SCORING_EFFICIENCY: 20,
    FREE_THROWS: 10,
    THREE_POINT: 12,
    FOUR_POINT: 8,
  } as Partial<Record<DevelopmentDimensionKey, number>>,
  // Sample >= gate x this multiplier is HIGH confidence; otherwise MEDIUM.
  highConfidenceMultiplier: 2,
  confidenceWeight: { HIGH: 1, MEDIUM: 0.75 } as Record<Confidence, number>,
  // Below this many qualified peers in the position group, the baseline falls back to the league.
  minPeers: 5,
  // Percentile (0-100 vs baseline) below which a dimension becomes a Focus Area candidate.
  // 30 (not higher): most players should have something to work on, but not a flag for everyone.
  focusBelowPercentile: 30,
  // Percentile at or above which a dimension is a Strength.
  strengthAtOrAbovePercentile: 70,
  maxFocusAreas: 3,
  maxStrengths: 2,
  drillsPerFocusArea: 3,
  trend: {
    // 3 recent games so a trend appears once a player has 5 games played (n + 2).
    recentGames: 3,
    // Relative change in a per-game rate, or absolute change in percentage points, needed to call
    // a trend improving or declining.
    perGameRelative: 0.15,
    percentagePoints: 5,
  },
  target: {
    reviewWindowGames: 6,
    // Percentage-point step toward the peer median per review window.
    percentageStep: { SCORING_EFFICIENCY: 4, FREE_THROWS: 6, THREE_POINT: 4, FOUR_POINT: 5 } as Partial<Record<DevelopmentDimensionKey, number>>,
    // Relative step for per-game rates per review window.
    perGameStep: 0.25,
  },
};

// How much each dimension matters for a role. 1.0 = neutral. Tune with coaches, not in code.
export const roleImpactWeights: Record<PositionGroup, Record<DevelopmentDimensionKey, number>> = {
  GUARD: {
    SCORING_EFFICIENCY: 1.1, FREE_THROWS: 1.1, THREE_POINT: 1.2, FOUR_POINT: 1.1, PLAYMAKING: 1.3,
    BALL_SECURITY: 1.3, REBOUNDING: 0.6, DEFENSIVE_ACTIVITY: 1.0, FOUL_DISCIPLINE: 0.9,
  },
  WING: {
    SCORING_EFFICIENCY: 1.2, FREE_THROWS: 1.0, THREE_POINT: 1.2, FOUR_POINT: 1.0, PLAYMAKING: 0.9,
    BALL_SECURITY: 1.0, REBOUNDING: 0.9, DEFENSIVE_ACTIVITY: 1.2, FOUL_DISCIPLINE: 1.0,
  },
  BIG: {
    SCORING_EFFICIENCY: 1.2, FREE_THROWS: 1.2, THREE_POINT: 0.6, FOUR_POINT: 0.4, PLAYMAKING: 0.7,
    BALL_SECURITY: 0.9, REBOUNDING: 1.4, DEFENSIVE_ACTIVITY: 1.2, FOUL_DISCIPLINE: 1.2,
  },
  UNKNOWN: {
    SCORING_EFFICIENCY: 1, FREE_THROWS: 1, THREE_POINT: 1, FOUR_POINT: 1, PLAYMAKING: 1,
    BALL_SECURITY: 1, REBOUNDING: 1, DEFENSIVE_ACTIVITY: 1, FOUL_DISCIPLINE: 1,
  },
};

// C2 Game Plan thresholds (ADR-011). Ratios compare a team's per-game rate with the league mean
// of team rates; 1.15 / 0.87 mirror Team DNA's tag threshold so the two layers agree.
export const gamePlanConfig = {
  minOpponentGames: 3,
  highConfidenceGames: 6,
  minPlayerGames: 3,
  maxKeys: 5,
  highRatio: 1.15,
  lowRatio: 0.87,
  focalUsageShare: 0.28,
  // League-relative "poor free-throw shooter": below the league 25th percentile FT% among players
  // with poorFtMinAttempts+ attempts (LBCL today ~40%). Used by both the FOUL_POOR_FT_SHOOTER key
  // and lateGame.foulTarget so they agree.
  poorFtPercentile: 25,
  poorFtMinAttempts: 10,
  // Which three-point key fires once the rate bar is cleared.
  threePctWeak: 30,
  threePctStrong: 33,
  // ATTACK_FOUL_TROUBLE fires at/above the league 90th percentile of fouls per game among players
  // who clear the minutes gate. foulTroublePerGame stays only as the defender "foul risk" flag.
  foulTroublePercentile: 90,
  foulTroublePerGame: 3,
  // Floor for half-split keys; the effective bar is max(this, 2 x the margin's standard error).
  halfMarginSwing: 3,
  threatsToAssign: 3,
  closerFtMinAttempts: 10,
  closerThreeMinAttempts: 12,
  closerFourMinAttempts: 8,
};
