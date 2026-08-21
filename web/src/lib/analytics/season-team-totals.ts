import type { GameCore, TeamSideStats } from "./types";

// Season-wide per-team aggregate, independent of Team DNA's internal representation so the
// metric registry / comparison / similarity features have one clean shape to depend on without
// coupling to team-dna.ts's own (separately tested) aggregation.
export type SeasonTeamTotals = {
  seasonClubId: string;
  shortName: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  pointsInPaint: number | null;
  benchPoints: number | null;
  fastBreakPoints: number | null;
  paintGamesCaptured: number;
  benchGamesCaptured: number;
  fastBreakGamesCaptured: number;
};

function sumOptional(current: number | null, addend: number | null): number | null {
  if (addend == null) return current;
  return (current ?? 0) + addend;
}

export function computeSeasonTeamTotals(games: GameCore[]): Map<string, SeasonTeamTotals> {
  const byTeam = new Map<string, SeasonTeamTotals>();

  function ingest(side: TeamSideStats, opponent: TeamSideStats) {
    const existing = byTeam.get(side.seasonClubId) ?? {
      seasonClubId: side.seasonClubId,
      shortName: side.shortName,
      name: side.name,
      logoUrl: side.logoUrl,
      primaryColor: side.primaryColor,
      gamesPlayed: 0, wins: 0, losses: 0,
      pointsFor: 0, pointsAgainst: 0,
      rebounds: 0, assists: 0, turnovers: 0,
      fieldGoalsMade: 0, fieldGoalsAttempted: 0,
      pointsInPaint: null, benchPoints: null, fastBreakPoints: null,
      paintGamesCaptured: 0, benchGamesCaptured: 0, fastBreakGamesCaptured: 0,
    };
    existing.gamesPlayed += 1;
    if (side.score > opponent.score) existing.wins += 1;
    else if (side.score < opponent.score) existing.losses += 1;
    existing.pointsFor += side.score;
    existing.pointsAgainst += opponent.score;
    existing.assists += side.assists;
    existing.turnovers += side.turnovers;
    if (side.offensiveRebounds != null && side.defensiveRebounds != null) {
      existing.rebounds += side.offensiveRebounds + side.defensiveRebounds;
    }
    if (side.fieldGoalsMade != null) existing.fieldGoalsMade += side.fieldGoalsMade;
    if (side.fieldGoalsAttempted != null) existing.fieldGoalsAttempted += side.fieldGoalsAttempted;
    if (side.pointsInPaint != null) { existing.pointsInPaint = sumOptional(existing.pointsInPaint, side.pointsInPaint); existing.paintGamesCaptured += 1; }
    if (side.benchPoints != null) { existing.benchPoints = sumOptional(existing.benchPoints, side.benchPoints); existing.benchGamesCaptured += 1; }
    if (side.fastBreakPoints != null) { existing.fastBreakPoints = sumOptional(existing.fastBreakPoints, side.fastBreakPoints); existing.fastBreakGamesCaptured += 1; }
    byTeam.set(side.seasonClubId, existing);
  }

  for (const g of games) {
    ingest(g.home, g.away);
    ingest(g.away, g.home);
  }
  return byTeam;
}
