// Per-game log for a player across the season, plus deterministic "best game by category"
// selection. Complements loadPlayerBestGame() in game-analytics.ts (which picks a single
// overall-best game by effective efficiency, matching Game Star) — this module exposes the
// full game-by-game history and lets a caller ask for the best game in a *specific* category
// (highest scoring, best rebounding, best playmaking) rather than only the single most complete
// performance.

export type PlayerGameLogRow = {
  fixtureId: string;
  scheduledAt: Date;
  opponentShortName: string;
  result: "W" | "L" | "T";
  didNotPlay: boolean;
  minutesPlayed: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  threePointsMade: number | null;
  threePointsAttempted: number | null;
  freeThrowsMade: number | null;
  freeThrowsAttempted: number | null;
  efficiency: number;
};

export type BestGameCategory = "HIGHEST_SCORING" | "BEST_REBOUNDING" | "BEST_PLAYMAKING";

const CATEGORY_METRIC: Record<BestGameCategory, keyof Pick<PlayerGameLogRow, "points" | "rebounds" | "assists">> = {
  HIGHEST_SCORING: "points",
  BEST_REBOUNDING: "rebounds",
  BEST_PLAYMAKING: "assists",
};

// Deterministic tie-breaking: rank by the category's own stat first; if tied, prefer the game
// with the higher effective efficiency (the more complete performance); if still tied, prefer
// the chronologically earliest game (stable, reproducible — never "most recent," which would
// silently change as new games are added under an identical tie).
export function selectBestGameByCategory(log: PlayerGameLogRow[], category: BestGameCategory): PlayerGameLogRow | null {
  const active = log.filter((r) => !r.didNotPlay);
  if (active.length === 0) return null;
  const metric = CATEGORY_METRIC[category];
  return [...active].sort((a, b) => {
    if (b[metric] !== a[metric]) return b[metric] - a[metric];
    if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
    return a.scheduledAt.getTime() - b.scheduledAt.getTime();
  })[0];
}
