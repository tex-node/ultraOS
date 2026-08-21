import { percent } from "./normalization";
import type { GameCore, PlayerLine, TeamSideStats } from "./types";

export type TeamComparisonRow = {
  key: string;
  label: string;
  home: string;
  away: string;
  homeIsBetter: boolean | null;
};

function sumOrNull(players: PlayerLine[], field: keyof PlayerLine): number | null {
  const values = players.map((p) => p[field]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

export function teamShootingSplits(game: GameCore, side: "HOME" | "AWAY") {
  const players = game.players.filter((p) => p.side === side);
  return {
    fieldGoalsMade: sumOrNull(players, "fieldGoalsMade"),
    fieldGoalsAttempted: sumOrNull(players, "fieldGoalsAttempted"),
    twoPointsMade: sumOrNull(players, "twoPointsMade"),
    twoPointsAttempted: sumOrNull(players, "twoPointsAttempted"),
    threePointsMade: sumOrNull(players, "threePointsMade"),
    threePointsAttempted: sumOrNull(players, "threePointsAttempted"),
    freeThrowsMade: sumOrNull(players, "freeThrowsMade"),
    freeThrowsAttempted: sumOrNull(players, "freeThrowsAttempted"),
  };
}

function row(key: string, label: string, home: number | null, away: number | null, fmt: (v: number) => string, higherIsBetter = true): TeamComparisonRow {
  return {
    key,
    label,
    home: home != null ? fmt(home) : "—",
    away: away != null ? fmt(away) : "—",
    homeIsBetter: home != null && away != null && home !== away ? (higherIsBetter ? home > away : home < away) : null,
  };
}

export function buildTeamComparison(game: GameCore): TeamComparisonRow[] {
  const homeSplits = teamShootingSplits(game, "HOME");
  const awaySplits = teamShootingSplits(game, "AWAY");
  const pct = (v: number) => `${v.toFixed(1)}%`;
  const int = (v: number) => String(v);

  const rows: TeamComparisonRow[] = [];
  rows.push(row("fgPct", "FG%", percent(homeSplits.fieldGoalsMade, homeSplits.fieldGoalsAttempted), percent(awaySplits.fieldGoalsMade, awaySplits.fieldGoalsAttempted), pct));
  rows.push(row("twoPct", "2PT%", percent(homeSplits.twoPointsMade, homeSplits.twoPointsAttempted), percent(awaySplits.twoPointsMade, awaySplits.twoPointsAttempted), pct));
  rows.push(row("threePct", "3PT%", percent(homeSplits.threePointsMade, homeSplits.threePointsAttempted), percent(awaySplits.threePointsMade, awaySplits.threePointsAttempted), pct));
  rows.push(row("ftPct", "FT%", percent(homeSplits.freeThrowsMade, homeSplits.freeThrowsAttempted), percent(awaySplits.freeThrowsMade, awaySplits.freeThrowsAttempted), pct));
  rows.push(row("rebounds", "REB", teamRebounds(game.home), teamRebounds(game.away), int));
  rows.push(row("assists", "AST", game.home.assists, game.away.assists, int));
  rows.push(row("turnovers", "TO", game.home.turnovers, game.away.turnovers, int, false));
  rows.push(row("paint", "Points in Paint", game.home.pointsInPaint, game.away.pointsInPaint, int));
  rows.push(row("secondChance", "Second Chance", game.home.secondChancePoints, game.away.secondChancePoints, int));
  rows.push(row("fastBreak", "Fast Break", game.home.fastBreakPoints, game.away.fastBreakPoints, int));
  rows.push(row("bench", "Bench Points", game.home.benchPoints, game.away.benchPoints, int));
  rows.push(row("ppp", "Points Per Possession", game.home.pointsPerPossession, game.away.pointsPerPossession, (v) => v.toFixed(2)));
  return rows;
}

function teamRebounds(team: TeamSideStats): number | null {
  if (team.offensiveRebounds == null || team.defensiveRebounds == null) return null;
  return team.offensiveRebounds + team.defensiveRebounds;
}
