import { formatPercent, percent, round1 } from "./normalization";
import { isShootingQualified } from "./qualification";
import type { SeasonPlayerTotals } from "./league-analytics";
import type { GameAnalyticsCapability } from "../game-data-capability";
import type { SeasonTeamTotals } from "./season-team-totals";

// Single source of truth for every comparable metric shown across Player/Team Comparison,
// Category Leaders, Player Discovery sorting, and rankings. Every consumer reads formatting,
// direction, and qualification rules from here instead of re-deriving them, so a metric can
// never be "higher is better" in one component and silently the opposite in another.

export type MetricDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";

export type PlayerMetricId =
  | "GAMES" | "PPG" | "RPG" | "APG" | "SPG" | "BPG" | "TOV_PER_GAME"
  | "FG_PCT" | "THREE_PCT" | "FT_PCT" | "EFFECTIVE_EFFICIENCY"
  // Future-only: no Season Zero game reaches EVENT_LEVEL/FULL_ULTRA, so these never resolve to
  // a value today. Kept here so the registry doesn't need a breaking shape change once a real
  // Ultra-native game exists — see Section 33 of the G.11 spec.
  | "FOUR_PT_MADE" | "FOUR_PT_ATTEMPTED" | "FOUR_PT_PCT"
  | "ULTRA_TIME_POINTS" | "ULTRA_TIME_FG_PCT";

export type TeamMetricId =
  | "WINS" | "LOSSES" | "WIN_PCT" | "PPG" | "OPP_PPG" | "POINT_DIFF"
  | "RPG" | "APG" | "TOV_PER_GAME" | "FG_PCT" | "PAINT_PTS" | "BENCH_PTS" | "FAST_BREAK_PTS"
  | "ULTRA_TIME_POINT_DIFFERENTIAL";

export type PlayerMetricDefinition = {
  id: PlayerMetricId;
  label: string;
  shortLabel: string;
  description: string;
  direction: MetricDirection;
  sourceRequirement: GameAnalyticsCapability;
  minimumGames?: number;
  minimumAttempts?: (totals: SeasonPlayerTotals) => number | null;
  formatter: (value: number) => string;
  getValue: (totals: SeasonPlayerTotals) => number | null;
};

export type TeamMetricDefinition = {
  id: TeamMetricId;
  label: string;
  shortLabel: string;
  description: string;
  direction: MetricDirection;
  sourceRequirement: GameAnalyticsCapability;
  formatter: (value: number) => string;
  getValue: (totals: SeasonTeamTotals) => number | null;
};

const perGame = (total: number, games: number) => (games > 0 ? total / games : 0);
const int = (v: number) => String(Math.round(v));
const one = (v: number) => v.toFixed(1);

export const PLAYER_METRICS: PlayerMetricDefinition[] = [
  { id: "GAMES", label: "Games Played", shortLabel: "GP", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: int, description: "Total games with recorded stats this season.", getValue: (t) => t.gamesPlayed },
  { id: "PPG", label: "Points Per Game", shortLabel: "PPG", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumGames: 2, formatter: one, description: "Total points ÷ games played.", getValue: (t) => round1(perGame(t.points, t.gamesPlayed)) },
  { id: "RPG", label: "Rebounds Per Game", shortLabel: "RPG", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumGames: 2, formatter: one, description: "Total rebounds ÷ games played.", getValue: (t) => round1(perGame(t.rebounds, t.gamesPlayed)) },
  { id: "APG", label: "Assists Per Game", shortLabel: "APG", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumGames: 2, formatter: one, description: "Total assists ÷ games played.", getValue: (t) => round1(perGame(t.assists, t.gamesPlayed)) },
  { id: "SPG", label: "Steals Per Game", shortLabel: "SPG", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumGames: 2, formatter: one, description: "Total steals ÷ games played.", getValue: (t) => round1(perGame(t.steals, t.gamesPlayed)) },
  { id: "BPG", label: "Blocks Per Game", shortLabel: "BPG", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumGames: 2, formatter: one, description: "Total blocks ÷ games played.", getValue: (t) => round1(perGame(t.blocks, t.gamesPlayed)) },
  { id: "TOV_PER_GAME", label: "Turnovers Per Game", shortLabel: "TOV/G", direction: "LOWER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumGames: 2, formatter: one, description: "Total turnovers ÷ games played. Fewer is better.", getValue: (t) => round1(perGame(t.turnovers, t.gamesPlayed)) },
  { id: "FG_PCT", label: "Field Goal %", shortLabel: "FG%", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumAttempts: (t) => t.fieldGoalsAttempted, formatter: (v) => formatPercent(v), description: "Field goals made ÷ attempted. Requires a minimum attempt sample.", getValue: (t) => percent(t.fieldGoalsMade, t.fieldGoalsAttempted) },
  { id: "THREE_PCT", label: "Three-Point %", shortLabel: "3PT%", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumAttempts: (t) => t.threePointsAttempted, formatter: (v) => formatPercent(v), description: "Three-pointers made ÷ attempted. Requires a minimum attempt sample.", getValue: (t) => percent(t.threePointsMade, t.threePointsAttempted) },
  { id: "FT_PCT", label: "Free Throw %", shortLabel: "FT%", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumAttempts: (t) => t.freeThrowsAttempted, formatter: (v) => formatPercent(v), description: "Free throws made ÷ attempted. Requires a minimum attempt sample.", getValue: (t) => percent(t.freeThrowsMade, t.freeThrowsAttempted) },
  { id: "EFFECTIVE_EFFICIENCY", label: "Effective Efficiency", shortLabel: "EFF", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", minimumGames: 2, formatter: one, description: "Season total of PTS+REB+AST+STL+BLK minus missed FG/FT minus TO, per game — the same formula Game Star uses.", getValue: (t) => {
    const missedFg = Math.max(0, t.fieldGoalsAttempted - t.fieldGoalsMade);
    const missedFt = Math.max(0, t.freeThrowsAttempted - t.freeThrowsMade);
    const eff = t.points + t.rebounds + t.assists + t.steals + t.blocks - missedFg - missedFt - t.turnovers;
    return round1(perGame(eff, t.gamesPlayed));
  } },
  // Future-only — always null for Season Zero (see doc comment above). Never rendered as 0.
  { id: "FOUR_PT_MADE", label: "4PT Made", shortLabel: "4PTM", direction: "HIGHER_IS_BETTER", sourceRequirement: "FULL_ULTRA", formatter: int, description: "Ultra-native 4-point makes. Requires Ultra live-scored event data.", getValue: () => null },
  { id: "FOUR_PT_ATTEMPTED", label: "4PT Attempted", shortLabel: "4PTA", direction: "HIGHER_IS_BETTER", sourceRequirement: "FULL_ULTRA", formatter: int, description: "Ultra-native 4-point attempts. Requires Ultra live-scored event data.", getValue: () => null },
  { id: "FOUR_PT_PCT", label: "4PT %", shortLabel: "4PT%", direction: "HIGHER_IS_BETTER", sourceRequirement: "FULL_ULTRA", formatter: (v) => formatPercent(v), description: "4-point makes ÷ attempts. Requires Ultra live-scored event data.", getValue: () => null },
  { id: "ULTRA_TIME_POINTS", label: "Ultra Time Points", shortLabel: "UT PTS", direction: "HIGHER_IS_BETTER", sourceRequirement: "FULL_ULTRA", formatter: int, description: "Points scored during Ultra Time. Requires Ultra live-scored event data.", getValue: () => null },
  { id: "ULTRA_TIME_FG_PCT", label: "Ultra Time FG%", shortLabel: "UT FG%", direction: "HIGHER_IS_BETTER", sourceRequirement: "FULL_ULTRA", formatter: (v) => formatPercent(v), description: "Field goal % during Ultra Time. Requires Ultra live-scored event data.", getValue: () => null },
];

export const TEAM_METRICS: TeamMetricDefinition[] = [
  { id: "WINS", label: "Wins", shortLabel: "W", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: int, description: "Games won this season.", getValue: (t) => t.wins },
  { id: "LOSSES", label: "Losses", shortLabel: "L", direction: "LOWER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: int, description: "Games lost this season.", getValue: (t) => t.losses },
  { id: "WIN_PCT", label: "Win %", shortLabel: "WIN%", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: (v) => formatPercent(v), description: "Wins ÷ games played.", getValue: (t) => t.gamesPlayed > 0 ? (t.wins / t.gamesPlayed) * 100 : null },
  { id: "PPG", label: "Points Per Game", shortLabel: "PPG", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: one, description: "Points scored ÷ games played.", getValue: (t) => round1(perGame(t.pointsFor, t.gamesPlayed)) },
  { id: "OPP_PPG", label: "Opponent Points Per Game", shortLabel: "OPP PPG", direction: "LOWER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: one, description: "Points allowed ÷ games played.", getValue: (t) => round1(perGame(t.pointsAgainst, t.gamesPlayed)) },
  { id: "POINT_DIFF", label: "Point Differential", shortLabel: "DIFF", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: (v) => (v > 0 ? `+${v}` : String(v)), description: "Points scored minus points allowed.", getValue: (t) => t.pointsFor - t.pointsAgainst },
  { id: "RPG", label: "Rebounds Per Game", shortLabel: "RPG", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: one, description: "Team rebounds ÷ games played.", getValue: (t) => round1(perGame(t.rebounds, t.gamesPlayed)) },
  { id: "APG", label: "Assists Per Game", shortLabel: "APG", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: one, description: "Team assists ÷ games played.", getValue: (t) => round1(perGame(t.assists, t.gamesPlayed)) },
  { id: "TOV_PER_GAME", label: "Turnovers Per Game", shortLabel: "TOV/G", direction: "LOWER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: one, description: "Team turnovers ÷ games played. Fewer is better.", getValue: (t) => round1(perGame(t.turnovers, t.gamesPlayed)) },
  { id: "FG_PCT", label: "Field Goal %", shortLabel: "FG%", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: (v) => formatPercent(v), description: "Team field goals made ÷ attempted across the season.", getValue: (t) => t.fieldGoalsAttempted > 0 ? percent(t.fieldGoalsMade, t.fieldGoalsAttempted) : null },
  { id: "PAINT_PTS", label: "Paint Points Per Game", shortLabel: "PAINT", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: one, description: "Points in the paint ÷ games with paint data captured.", getValue: (t) => t.pointsInPaint != null && t.paintGamesCaptured > 0 ? round1(t.pointsInPaint / t.paintGamesCaptured) : null },
  { id: "BENCH_PTS", label: "Bench Points Per Game", shortLabel: "BENCH", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: one, description: "Bench points ÷ games with bench data captured.", getValue: (t) => t.benchPoints != null && t.benchGamesCaptured > 0 ? round1(t.benchPoints / t.benchGamesCaptured) : null },
  { id: "FAST_BREAK_PTS", label: "Fast Break Points Per Game", shortLabel: "FB", direction: "HIGHER_IS_BETTER", sourceRequirement: "BOX_SCORE_ONLY", formatter: one, description: "Fast break points ÷ games with fast-break data captured.", getValue: (t) => t.fastBreakPoints != null && t.fastBreakGamesCaptured > 0 ? round1(t.fastBreakPoints / t.fastBreakGamesCaptured) : null },
  { id: "ULTRA_TIME_POINT_DIFFERENTIAL", label: "Ultra Time Point Differential", shortLabel: "UT DIFF", direction: "HIGHER_IS_BETTER", sourceRequirement: "FULL_ULTRA", formatter: (v) => (v > 0 ? `+${v}` : String(v)), description: "Ultra Time points for minus against. Requires Ultra live-scored event data.", getValue: () => null },
];

export function isPlayerMetricQualified(metric: PlayerMetricDefinition, totals: SeasonPlayerTotals): boolean {
  if (metric.minimumGames != null && totals.gamesPlayed < metric.minimumGames) return false;
  if (metric.minimumAttempts) {
    const attempts = metric.minimumAttempts(totals);
    if (!isShootingQualified(attempts)) return false;
  }
  return true;
}

export function findPlayerMetric(id: PlayerMetricId): PlayerMetricDefinition {
  const m = PLAYER_METRICS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown player metric: ${id}`);
  return m;
}

export function findTeamMetric(id: TeamMetricId): TeamMetricDefinition {
  const m = TEAM_METRICS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown team metric: ${id}`);
  return m;
}
