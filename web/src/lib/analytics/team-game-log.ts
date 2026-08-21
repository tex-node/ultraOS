import { percent } from "./normalization";
import type { GameCore } from "./types";

// Per-game log for a club across the season, plus a deterministic "Best Team Performance"
// selection — built purely from GameCore[] (already loaded by loadSeasonGameCores), so this
// file never touches Prisma directly.

export type TeamGameLogRow = {
  fixtureId: string;
  scheduledAt: Date;
  opponentShortName: string;
  result: "W" | "L" | "T";
  pointsFor: number;
  pointsAgainst: number;
  margin: number;
  fieldGoalPct: number | null;
  rebounds: number | null;
  assists: number;
  turnovers: number;
  pointsInPaint: number | null;
  benchPoints: number | null;
};

export function buildTeamGameLog(games: GameCore[], seasonClubId: string): TeamGameLogRow[] {
  const rows: TeamGameLogRow[] = [];
  for (const g of games) {
    const isHome = g.home.seasonClubId === seasonClubId;
    if (!isHome && g.away.seasonClubId !== seasonClubId) continue;
    const own = isHome ? g.home : g.away;
    const opp = isHome ? g.away : g.home;
    const rebounds = own.offensiveRebounds != null && own.defensiveRebounds != null ? own.offensiveRebounds + own.defensiveRebounds : null;
    rows.push({
      fixtureId: g.fixtureId,
      scheduledAt: g.scheduledAt,
      opponentShortName: opp.shortName,
      result: own.score > opp.score ? "W" : own.score < opp.score ? "L" : "T",
      pointsFor: own.score,
      pointsAgainst: opp.score,
      margin: own.score - opp.score,
      fieldGoalPct: percent(own.fieldGoalsMade, own.fieldGoalsAttempted),
      rebounds,
      assists: own.assists,
      turnovers: own.turnovers,
      pointsInPaint: own.pointsInPaint,
      benchPoints: own.benchPoints,
    });
  }
  return rows.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export type BestTeamPerformance = { row: TeamGameLogRow; score: number };

// Deterministic composite: point differential (the primary signal — how much a team won or
// lost by) plus a rebounding-edge and bench-production bonus, each normalized to a ceiling
// before summing so no single raw number can dominate purely by having a larger natural scale.
// This is deliberately NOT "biggest margin alone" — a blowout margin with no supporting edges
// still ranks below a closer, more complete performance with rebounding + bench strength.
// Ceilings match the ones used elsewhere in the analytics domain (see matchup-intelligence.ts).
const CEILINGS = { margin: 30, rebounds: 15, bench: 15 };

export function selectBestTeamPerformance(log: TeamGameLogRow[]): BestTeamPerformance | null {
  const wins = log.filter((r) => r.result === "W");
  const candidates = wins.length > 0 ? wins : log;
  if (candidates.length === 0) return null;

  function score(row: TeamGameLogRow): number {
    const marginScore = Math.max(0, row.margin) / CEILINGS.margin;
    const reboundScore = row.rebounds != null ? row.rebounds / CEILINGS.rebounds : 0;
    const benchScore = row.benchPoints != null ? row.benchPoints / CEILINGS.bench : 0;
    return marginScore + reboundScore * 0.5 + benchScore * 0.5;
  }

  const ranked = candidates
    .map((row) => ({ row, score: score(row) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.row.scheduledAt.getTime() - b.row.scheduledAt.getTime()));
  return ranked[0];
}
