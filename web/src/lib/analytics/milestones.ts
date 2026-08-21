import { isShootingQualified } from "./qualification";
import { percent } from "./normalization";
import type { GameCore, PlayerLine } from "./types";

// Deterministic single-game milestones — thresholds calibrated against Season Zero's actual
// distribution (2×10-minute format, 11 real games), not copied from NBA-scale numbers. A 5+
// assist milestone would never fire this season (the real single-game max is 4), so thresholds
// here were chosen by inspecting the real PlayerStat/TeamStat distribution first. See
// SEASON_ZERO_ANALYTICS_METHODS.md for the exact counts behind each choice.

export type PlayerMilestoneKey =
  | "POINTS_10"
  | "POINTS_15"
  | "REBOUNDS_5"
  | "REBOUNDS_8"
  | "ASSISTS_3"
  | "STEALS_2"
  | "STEALS_5"
  | "PERFECT_QUALIFIED_SHOOTING";

export type TeamMilestoneKey = "TEAM_POINTS_30" | "TEAM_REBOUNDS_20" | "TEAM_BENCH_10" | "TEAM_PAINT_ADVANTAGE_10";

export const PLAYER_MILESTONE_LABEL: Record<PlayerMilestoneKey, string> = {
  POINTS_10: "10+ Point Game",
  POINTS_15: "15+ Point Game",
  REBOUNDS_5: "5+ Rebound Game",
  REBOUNDS_8: "8+ Rebound Game",
  ASSISTS_3: "3+ Assist Game",
  STEALS_2: "2+ Steal Game",
  STEALS_5: "5+ Steal Game",
  PERFECT_QUALIFIED_SHOOTING: "Perfect Qualified Shooting",
};

export const TEAM_MILESTONE_LABEL: Record<TeamMilestoneKey, string> = {
  TEAM_POINTS_30: "30+ Team Point Game",
  TEAM_REBOUNDS_20: "20+ Team Rebound Game",
  TEAM_BENCH_10: "10+ Bench Point Game",
  TEAM_PAINT_ADVANTAGE_10: "10+ Point Paint Advantage",
};

export type PlayerMilestone = {
  key: PlayerMilestoneKey;
  label: string;
  playerId: string;
  playerName: string;
  seasonClubShortName: string;
  value: string;
  fixtureId: string;
  opponentShortName: string;
  scheduledAt: Date;
};

export type TeamMilestone = {
  key: TeamMilestoneKey;
  label: string;
  seasonClubId: string;
  teamName: string;
  teamShortName: string;
  value: string;
  fixtureId: string;
  opponentShortName: string;
  scheduledAt: Date;
};

function playerMilestonesForRow(row: PlayerLine, fixtureId: string, opponentShortName: string, scheduledAt: Date): PlayerMilestone[] {
  const out: PlayerMilestone[] = [];
  const base = { playerId: row.playerId, playerName: row.name, seasonClubShortName: row.seasonClubShortName, fixtureId, opponentShortName, scheduledAt };

  if (row.points >= 10) out.push({ ...base, key: "POINTS_10", label: PLAYER_MILESTONE_LABEL.POINTS_10, value: `${row.points} PTS` });
  if (row.points >= 15) out.push({ ...base, key: "POINTS_15", label: PLAYER_MILESTONE_LABEL.POINTS_15, value: `${row.points} PTS` });
  if (row.rebounds >= 5) out.push({ ...base, key: "REBOUNDS_5", label: PLAYER_MILESTONE_LABEL.REBOUNDS_5, value: `${row.rebounds} REB` });
  if (row.rebounds >= 8) out.push({ ...base, key: "REBOUNDS_8", label: PLAYER_MILESTONE_LABEL.REBOUNDS_8, value: `${row.rebounds} REB` });
  if (row.assists >= 3) out.push({ ...base, key: "ASSISTS_3", label: PLAYER_MILESTONE_LABEL.ASSISTS_3, value: `${row.assists} AST` });
  if (row.steals >= 2) out.push({ ...base, key: "STEALS_2", label: PLAYER_MILESTONE_LABEL.STEALS_2, value: `${row.steals} STL` });
  if (row.steals >= 5) out.push({ ...base, key: "STEALS_5", label: PLAYER_MILESTONE_LABEL.STEALS_5, value: `${row.steals} STL` });
  if (isShootingQualified(row.fieldGoalsAttempted) && percent(row.fieldGoalsMade, row.fieldGoalsAttempted) === 100) {
    out.push({ ...base, key: "PERFECT_QUALIFIED_SHOOTING", label: PLAYER_MILESTONE_LABEL.PERFECT_QUALIFIED_SHOOTING, value: `${row.fieldGoalsMade}/${row.fieldGoalsAttempted} FG` });
  }
  return out;
}

export function buildPlayerMilestones(games: GameCore[]): PlayerMilestone[] {
  const out: PlayerMilestone[] = [];
  for (const g of games) {
    for (const p of g.players) {
      if (p.didNotPlay) continue;
      const opponentShortName = p.side === "HOME" ? g.away.shortName : g.home.shortName;
      out.push(...playerMilestonesForRow(p, g.fixtureId, opponentShortName, g.scheduledAt));
    }
  }
  return out;
}

export function buildPlayerMilestonesForPlayer(games: GameCore[], playerId: string): PlayerMilestone[] {
  return buildPlayerMilestones(games).filter((m) => m.playerId === playerId);
}

function teamMilestonesForSide(side: GameCore["home"], opponent: GameCore["home"], fixtureId: string, scheduledAt: Date, paintAdvantage: number | null): TeamMilestone[] {
  const out: TeamMilestone[] = [];
  const base = { seasonClubId: side.seasonClubId, teamName: side.name, teamShortName: side.shortName, fixtureId, opponentShortName: opponent.shortName, scheduledAt };

  if (side.score >= 30) out.push({ ...base, key: "TEAM_POINTS_30", label: TEAM_MILESTONE_LABEL.TEAM_POINTS_30, value: `${side.score} PTS` });
  if (side.rebounds >= 20) out.push({ ...base, key: "TEAM_REBOUNDS_20", label: TEAM_MILESTONE_LABEL.TEAM_REBOUNDS_20, value: `${side.rebounds} REB` });
  if (side.benchPoints != null && side.benchPoints >= 10) out.push({ ...base, key: "TEAM_BENCH_10", label: TEAM_MILESTONE_LABEL.TEAM_BENCH_10, value: `${side.benchPoints} PTS` });
  if (paintAdvantage != null && paintAdvantage >= 10) out.push({ ...base, key: "TEAM_PAINT_ADVANTAGE_10", label: TEAM_MILESTONE_LABEL.TEAM_PAINT_ADVANTAGE_10, value: `+${paintAdvantage} PAINT` });
  return out;
}

export function buildTeamMilestones(games: GameCore[]): TeamMilestone[] {
  const out: TeamMilestone[] = [];
  for (const g of games) {
    const paint = g.home.pointsInPaint != null && g.away.pointsInPaint != null ? g.home.pointsInPaint - g.away.pointsInPaint : null;
    out.push(...teamMilestonesForSide(g.home, g.away, g.fixtureId, g.scheduledAt, paint));
    out.push(...teamMilestonesForSide(g.away, g.home, g.fixtureId, g.scheduledAt, paint != null ? -paint : null));
  }
  return out;
}

export function buildTeamMilestonesForClub(games: GameCore[], seasonClubId: string): TeamMilestone[] {
  return buildTeamMilestones(games).filter((m) => m.seasonClubId === seasonClubId);
}
