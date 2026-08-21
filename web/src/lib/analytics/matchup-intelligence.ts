import { compareByDirection, meaningfulSeparation, type ComparisonResult } from "./directional-comparison";
import { percent } from "./normalization";
import type { GameCore } from "./types";

// "Matchup Intelligence" for a single game: which statistical categories separated the two
// sides by a meaningful margin, and which side held the edge in each. Deliberately side-neutral
// (HOME/AWAY, not WINNER/LOSER) — unlike Why They Won, this describes the game profile, not a
// causal story about the result. Every factor goes through compareByDirection so a factor can
// never be attributed to the side that was actually worse in that stat — the exact class of bug
// G.9 found in Why They Won.

export type MatchupFactor = {
  key: string;
  label: string;
  homeValue: string;
  awayValue: string;
  edge: ComparisonResult;
  // 0-1 share of the visual bar that belongs to the home side, for a compact bar visualization.
  homeShare: number;
  separation: number;
};

const CEILINGS = { percent: 100, rebounds: 15, assists: 10, turnovers: 10, paint: 20, bench: 15, fastBreak: 10, secondHalf: 20 };
const MEANINGFUL_THRESHOLD = 0.15;

function pushIfMeaningful(
  factors: MatchupFactor[],
  key: string,
  label: string,
  home: number | null,
  away: number | null,
  direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER",
  ceiling: number,
  fmt: (v: number) => string,
) {
  if (home == null || away == null) return;
  const separation = meaningfulSeparation(home, away, ceiling);
  if (separation < MEANINGFUL_THRESHOLD) return;
  const edge = compareByDirection(home, away, direction);
  const total = home + away;
  // For a "lower is better" stat (turnovers), the bar should still visually favor whoever has
  // the edge, so the share is inverted along with the direction.
  const rawShare = total > 0 ? home / total : 0.5;
  const homeShare = direction === "HIGHER_IS_BETTER" ? rawShare : 1 - rawShare;
  factors.push({ key, label, homeValue: fmt(home), awayValue: fmt(away), edge, homeShare, separation });
}

export function buildMatchupIntelligence(game: GameCore): MatchupFactor[] {
  const { home, away } = game;
  const factors: MatchupFactor[] = [];

  const homeReb = home.offensiveRebounds != null && home.defensiveRebounds != null ? home.offensiveRebounds + home.defensiveRebounds : null;
  const awayReb = away.offensiveRebounds != null && away.defensiveRebounds != null ? away.offensiveRebounds + away.defensiveRebounds : null;
  pushIfMeaningful(factors, "REBOUNDS", "Rebounds", homeReb, awayReb, "HIGHER_IS_BETTER", CEILINGS.rebounds, String);
  pushIfMeaningful(factors, "ASSISTS", "Assists", home.assists, away.assists, "HIGHER_IS_BETTER", CEILINGS.assists, String);
  pushIfMeaningful(factors, "TURNOVERS", "Turnovers", home.turnovers, away.turnovers, "LOWER_IS_BETTER", CEILINGS.turnovers, String);

  const homeFg = percent(home.fieldGoalsMade, home.fieldGoalsAttempted);
  const awayFg = percent(away.fieldGoalsMade, away.fieldGoalsAttempted);
  pushIfMeaningful(factors, "FG_PCT", "Field Goal %", homeFg, awayFg, "HIGHER_IS_BETTER", CEILINGS.percent, (v) => `${v.toFixed(1)}%`);

  pushIfMeaningful(factors, "PAINT_POINTS", "Paint Points", home.pointsInPaint, away.pointsInPaint, "HIGHER_IS_BETTER", CEILINGS.paint, String);
  pushIfMeaningful(factors, "BENCH_POINTS", "Bench Points", home.benchPoints, away.benchPoints, "HIGHER_IS_BETTER", CEILINGS.bench, String);
  pushIfMeaningful(factors, "FAST_BREAK", "Fast Break Points", home.fastBreakPoints, away.fastBreakPoints, "HIGHER_IS_BETTER", CEILINGS.fastBreak, String);

  const reg = game.periods.filter((p) => !/^OT/i.test(p.label));
  if (reg.length >= 2) {
    const first = reg[0];
    const finalReg = reg[reg.length - 1];
    const homeSecondHalf = finalReg.homeScore - first.homeScore;
    const awaySecondHalf = finalReg.awayScore - first.awayScore;
    pushIfMeaningful(factors, "SECOND_HALF_SCORING", "Second-Half Scoring", homeSecondHalf, awaySecondHalf, "HIGHER_IS_BETTER", CEILINGS.secondHalf, String);
  }

  return factors.sort((a, b) => b.separation - a.separation);
}
