// Centralized thresholds for the analytics domain layer. Every "is this close / dominant /
// a small sample" decision reads from here instead of a magic number buried in a component,
// so tuning one number doesn't require hunting through UI code.
//
// Ultra Basketball plays a short format (2x10-minute halves, see ULTRA_RULES in game-rules.ts),
// so combined-score thresholds are calibrated against the real Season Zero score distribution
// (11 games, combined points 21-82) rather than imported from full-length basketball norms —
// a 90-combined-point "shootout" threshold would never fire in this format.
export const gameStoryConfig = {
  closeGame: { maxFinalMargin: 5 },
  dominant: { minFinalMargin: 20 },
  comeback: { minDeficitOvercome: 8 },
  secondHalfTakeover: { minSecondHalfSwing: 10 },
  shootout: { minCombinedPoints: 65 },
  defensiveBattle: { maxCombinedPoints: 28 },
  benchImpact: { minBenchPointsShare: 0.3 },
  paintDominance: { minPaintPointsMargin: 8 },
  turnoverPressure: { minPointsFromTurnoversMargin: 6 },
  perimeterEdge: { minThreePointPercentMargin: 15 },
  reboundingEdge: { minReboundMargin: 8 },
};

export const qualificationConfig = {
  shootingMinimumAttempts: 5,
  fourPointMinimumAttempts: 3,
  playerMinimumGamesForLeaderboard: 2,
  playerDevelopingMinimumGames: 1,
  teamMinimumGamesForDNA: 2,
  benchSparkMinimumBenchPoints: 8,
};

export const badgeThresholds = {
  sniper: { minThreePointPercent: 45, minThreePointMakes: 3 },
  perfectShooting: { minAttempts: 4 },
  glassCleaner: { minRebounds: 10 },
  playmaker: { minAssists: 6 },
  lockdown: { minSteals: 3 },
  paintBeast: { minPointsInPaint: 10 },
  highEfficiency: { minEfficiency: 20 },
};
