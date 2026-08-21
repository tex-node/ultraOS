import { qualificationConfig } from "./config";
import { percent } from "./normalization";
import { teamSampleQualification } from "./qualification";
import type { GameCore, QualificationState } from "./types";

// Deterministic team profile, normalized against Season Zero league averages. No AI-generated
// personality labels — every dimension is `team_rate / league_average_rate` (or the inverse,
// for stats where lower is better), and every tag has an explicit numeric threshold. A weak
// team is allowed to show up weak; nothing here manufactures flattering prose.

export type TeamDnaDimensionKey =
  | "SCORING"
  | "SHOOTING"
  | "PLAYMAKING"
  | "REBOUNDING"
  | "DEFENSE"
  | "TRANSITION"
  | "PAINT_ATTACK"
  | "BENCH_PRODUCTION"
  | "BALL_SECURITY";

export type TeamDnaDimension = { key: TeamDnaDimensionKey; label: string; index: number | null; teamValue: string; leagueAverage: string };

export type TeamDnaTag = "HIGH_PACE_SCORING" | "PAINT_HEAVY" | "BALL_MOVEMENT" | "REBOUNDING_TEAM" | "TRANSITION_THREAT" | "BENCH_DEPTH" | "LOW_TURNOVER";

export type TeamDna = {
  seasonClubId: string;
  shortName: string;
  gamesPlayed: number;
  qualification: QualificationState;
  dimensions: TeamDnaDimension[];
  tags: TeamDnaTag[];
};

const TAG_THRESHOLD = 1.15;
const MAX_TAGS = 3;

const TAG_BY_DIMENSION: Partial<Record<TeamDnaDimensionKey, TeamDnaTag>> = {
  SCORING: "HIGH_PACE_SCORING",
  PAINT_ATTACK: "PAINT_HEAVY",
  PLAYMAKING: "BALL_MOVEMENT",
  REBOUNDING: "REBOUNDING_TEAM",
  TRANSITION: "TRANSITION_THREAT",
  BENCH_PRODUCTION: "BENCH_DEPTH",
  BALL_SECURITY: "LOW_TURNOVER",
};

export const TEAM_DNA_DIMENSION_LABEL: Record<TeamDnaDimensionKey, string> = {
  SCORING: "Scoring",
  SHOOTING: "Shooting",
  PLAYMAKING: "Playmaking",
  REBOUNDING: "Rebounding",
  DEFENSE: "Defense",
  TRANSITION: "Transition",
  PAINT_ATTACK: "Paint Attack",
  BENCH_PRODUCTION: "Bench Production",
  BALL_SECURITY: "Ball Security",
};

export const TEAM_DNA_TAG_LABEL: Record<TeamDnaTag, string> = {
  HIGH_PACE_SCORING: "High-Pace Scoring",
  PAINT_HEAVY: "Paint Heavy",
  BALL_MOVEMENT: "Ball Movement",
  REBOUNDING_TEAM: "Rebounding Team",
  TRANSITION_THREAT: "Transition Threat",
  BENCH_DEPTH: "Bench Depth",
  LOW_TURNOVER: "Low Turnover",
};

type TeamGameLine = {
  points: number;
  opponentPoints: number;
  rebounds: number;
  assists: number;
  turnovers: number;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  pointsInPaint: number | null;
  fastBreakPoints: number | null;
  benchPoints: number | null;
};

function extractTeamGames(games: GameCore[]): Map<string, { shortName: string; lines: TeamGameLine[] }> {
  const byTeam = new Map<string, { shortName: string; lines: TeamGameLine[] }>();
  for (const game of games) {
    for (const [side, opponent] of [[game.home, game.away] as const, [game.away, game.home] as const]) {
      const entry = byTeam.get(side.seasonClubId) ?? { shortName: side.shortName, lines: [] };
      const reb = side.offensiveRebounds != null && side.defensiveRebounds != null ? side.offensiveRebounds + side.defensiveRebounds : 0;
      entry.lines.push({
        points: side.score,
        opponentPoints: opponent.score,
        rebounds: reb,
        assists: side.assists,
        turnovers: side.turnovers,
        fieldGoalsMade: side.fieldGoalsMade,
        fieldGoalsAttempted: side.fieldGoalsAttempted,
        pointsInPaint: side.pointsInPaint,
        fastBreakPoints: side.fastBreakPoints,
        benchPoints: side.benchPoints,
      });
      byTeam.set(side.seasonClubId, entry);
    }
  }
  return byTeam;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ratePerGame(lines: TeamGameLine[], field: keyof TeamGameLine): number | null {
  const values = lines.map((l) => l[field]).filter((v): v is number => typeof v === "number");
  return values.length === lines.length && values.length > 0 ? average(values) : null;
}

function weightedFgPct(lines: TeamGameLine[]): number | null {
  let made = 0;
  let attempted = 0;
  for (const l of lines) {
    if (l.fieldGoalsMade == null || l.fieldGoalsAttempted == null) continue;
    made += l.fieldGoalsMade;
    attempted += l.fieldGoalsAttempted;
  }
  return attempted > 0 ? percent(made, attempted) : null;
}

export function computeLeagueTeamDna(games: GameCore[]): Map<string, TeamDna> {
  const byTeam = extractTeamGames(games);
  const leagueFg: number[] = [];
  for (const { lines } of byTeam.values()) {
    const fg = weightedFgPct(lines);
    if (fg != null) leagueFg.push(fg);
  }

  const leagueAverages: Record<Exclude<TeamDnaDimensionKey, "SHOOTING">, number | null> = {
    SCORING: average([...byTeam.values()].map((t) => ratePerGame(t.lines, "points")).filter((v): v is number => v != null)),
    PLAYMAKING: average([...byTeam.values()].map((t) => ratePerGame(t.lines, "assists")).filter((v): v is number => v != null)),
    REBOUNDING: average([...byTeam.values()].map((t) => ratePerGame(t.lines, "rebounds")).filter((v): v is number => v != null)),
    DEFENSE: average([...byTeam.values()].map((t) => ratePerGame(t.lines, "opponentPoints")).filter((v): v is number => v != null)),
    TRANSITION: average([...byTeam.values()].map((t) => ratePerGame(t.lines, "fastBreakPoints")).filter((v): v is number => v != null)),
    PAINT_ATTACK: average([...byTeam.values()].map((t) => ratePerGame(t.lines, "pointsInPaint")).filter((v): v is number => v != null)),
    BENCH_PRODUCTION: average([...byTeam.values()].map((t) => ratePerGame(t.lines, "benchPoints")).filter((v): v is number => v != null)),
    BALL_SECURITY: average([...byTeam.values()].map((t) => ratePerGame(t.lines, "turnovers")).filter((v): v is number => v != null)),
  };
  const leagueShootingAvg = average(leagueFg);

  const result = new Map<string, TeamDna>();
  for (const [seasonClubId, { shortName, lines }] of byTeam) {
    const gamesPlayed = lines.length;
    const qualification = teamSampleQualification(gamesPlayed);

    function dim(key: TeamDnaDimensionKey, teamRate: number | null, leagueAvg: number | null, invert: boolean, fmt: (v: number) => string): TeamDnaDimension {
      const raw = teamRate != null && leagueAvg != null && leagueAvg > 0
        ? (invert ? leagueAvg / Math.max(teamRate, 0.01) : teamRate / leagueAvg)
        : null;
      // Same cap as Player DNA: a literal zero on an inverted stat (e.g. zero turnovers across
      // a team's small game sample) would otherwise divide by the 0.01 epsilon guard and produce
      // an unbounded, statistically meaningless index (previously this had no guard at all and
      // could even reach literal Infinity). Capped at 3.0 for the same reason.
      const index = raw != null ? Math.min(raw, 3) : null;
      return {
        key,
        label: TEAM_DNA_DIMENSION_LABEL[key],
        index: index != null ? Math.round(index * 100) / 100 : null,
        teamValue: teamRate != null ? fmt(teamRate) : "—",
        leagueAverage: leagueAvg != null ? fmt(leagueAvg) : "—",
      };
    }

    const dimensions: TeamDnaDimension[] = [
      dim("SCORING", ratePerGame(lines, "points"), leagueAverages.SCORING, false, (v) => v.toFixed(1)),
      dim("SHOOTING", weightedFgPct(lines), leagueShootingAvg, false, (v) => `${v.toFixed(1)}%`),
      dim("PLAYMAKING", ratePerGame(lines, "assists"), leagueAverages.PLAYMAKING, false, (v) => v.toFixed(1)),
      dim("REBOUNDING", ratePerGame(lines, "rebounds"), leagueAverages.REBOUNDING, false, (v) => v.toFixed(1)),
      dim("DEFENSE", ratePerGame(lines, "opponentPoints"), leagueAverages.DEFENSE, true, (v) => v.toFixed(1)),
      dim("TRANSITION", ratePerGame(lines, "fastBreakPoints"), leagueAverages.TRANSITION, false, (v) => v.toFixed(1)),
      dim("PAINT_ATTACK", ratePerGame(lines, "pointsInPaint"), leagueAverages.PAINT_ATTACK, false, (v) => v.toFixed(1)),
      dim("BENCH_PRODUCTION", ratePerGame(lines, "benchPoints"), leagueAverages.BENCH_PRODUCTION, false, (v) => v.toFixed(1)),
      dim("BALL_SECURITY", ratePerGame(lines, "turnovers"), leagueAverages.BALL_SECURITY, true, (v) => v.toFixed(1)),
    ];

    const tags = dimensions
      .filter((d) => d.index != null && d.index >= TAG_THRESHOLD && TAG_BY_DIMENSION[d.key])
      .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
      .slice(0, MAX_TAGS)
      .map((d) => TAG_BY_DIMENSION[d.key] as TeamDnaTag);

    result.set(seasonClubId, { seasonClubId, shortName, gamesPlayed, qualification, dimensions, tags });
  }
  return result;
}

export const TEAM_DNA_MIN_GAMES_NOTE = `Team DNA requires at least ${qualificationConfig.teamMinimumGamesForDNA} games played to be fully qualified; fewer games are shown as a developing profile.`;

// League Pulse's "Team Pulse" module asks "who leads the league in X" — this answers that from
// the same DNA map already computed for the club pages, restricted to fully QUALIFIED teams so
// a 1-game outlier can't claim a league-leading dimension.
export function topTeamByDimension(dnaByTeam: Map<string, TeamDna>, key: TeamDnaDimensionKey): TeamDna | null {
  const qualified = [...dnaByTeam.values()].filter((t) => t.qualification === "QUALIFIED");
  const withIndex = qualified.filter((t) => t.dimensions.find((d) => d.key === key)?.index != null);
  if (withIndex.length === 0) return null;
  return withIndex.sort((a, b) => (b.dimensions.find((d) => d.key === key)!.index! - a.dimensions.find((d) => d.key === key)!.index!))[0];
}
