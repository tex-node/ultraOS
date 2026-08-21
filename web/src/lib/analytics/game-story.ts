import { gameStoryConfig } from "./config";
import type { GameCore, GameStoryTag, Insight, PeriodScoreLine } from "./types";

// Narrowed to only the fields the classification actually reads (score/periods/rebounds/paint/
// turnover/bench numbers) rather than the full GameCore, so a live-derived caller (G.19's
// live-game-story.ts) can build a minimal, honest view instead of fabricating unused fields
// (divisionName, scheduledAt, dataCapability, players) just to satisfy the type. Every real
// GameCore already satisfies this narrower shape, so no existing caller changes.
export type GameStoryInput = Pick<GameCore, "home" | "away" | "periods">;

// Deterministic, rule-based game classification — no LLM. Every tag is derived from real
// persisted numbers (final score, period-cumulative scores, TeamStat advanced fields); if the
// data needed for a tag isn't present (e.g. no period scores at all), that tag is simply never
// emitted rather than guessed at.

function isOvertimePeriod(label: string): boolean {
  return /^OT/i.test(label);
}

function regulationPeriods(periods: PeriodScoreLine[]): PeriodScoreLine[] {
  return periods.filter((p) => !isOvertimePeriod(p.label));
}

export function classifyGameStory(game: GameStoryInput): GameStoryTag[] {
  const tags: GameStoryTag[] = [];
  const { home, away, periods } = game;
  const winner = home.score >= away.score ? home : away;
  const loser = winner === home ? away : home;
  const margin = Math.abs(home.score - away.score);
  const combined = home.score + away.score;

  if (margin > 0 && margin <= gameStoryConfig.closeGame.maxFinalMargin) tags.push("CLOSE_GAME");
  if (margin >= gameStoryConfig.dominant.minFinalMargin) tags.push("DOMINANT");
  if (periods.some((p) => isOvertimePeriod(p.label))) tags.push("OVERTIME");
  if (loser.biggestLead === 0 && winner.biggestLead != null && winner.biggestLead > 0) tags.push("WIRE_TO_WIRE");

  if (combined >= gameStoryConfig.shootout.minCombinedPoints) tags.push("SHOOTOUT");
  if (combined <= gameStoryConfig.defensiveBattle.maxCombinedPoints) tags.push("DEFENSIVE_BATTLE");

  const reg = regulationPeriods(periods);
  if (reg.length >= 2) {
    // Comeback: the eventual winner trailed by the configured margin at some earlier
    // checkpoint (period-cumulative, not just halftime — generalizes if finer-grained period
    // data is ever available).
    const winnerTrailedBy = Math.max(
      0,
      ...reg.slice(0, -1).map((p) => {
        const winnerCum = winner === home ? p.homeScore : p.awayScore;
        const loserCum = winner === home ? p.awayScore : p.homeScore;
        return loserCum - winnerCum;
      }),
    );
    if (winnerTrailedBy >= gameStoryConfig.comeback.minDeficitOvercome) tags.push("COMEBACK");

    // Second-half takeover: point-differential swing across the final regulation period vs.
    // the checkpoint before it, in the winner's favor. Deliberately excludes overtime — OT
    // swings are already captured by the OVERTIME tag and would muddy this one.
    const firstHalf = reg[0];
    const finalReg = reg[reg.length - 1];
    const winnerSecondHalfPts = (winner === home ? finalReg.homeScore : finalReg.awayScore) -
      (winner === home ? firstHalf.homeScore : firstHalf.awayScore);
    const loserSecondHalfPts = (winner === home ? finalReg.awayScore : finalReg.homeScore) -
      (winner === home ? firstHalf.awayScore : firstHalf.homeScore);
    if (winnerSecondHalfPts - loserSecondHalfPts >= gameStoryConfig.secondHalfTakeover.minSecondHalfSwing) {
      tags.push("SECOND_HALF_TAKEOVER");
    }
  }

  if (
    winner.benchPoints != null &&
    winner.score > 0 &&
    winner.benchPoints / winner.score >= gameStoryConfig.benchImpact.minBenchPointsShare
  ) {
    tags.push("BENCH_IMPACT");
  }

  if (
    home.pointsInPaint != null &&
    away.pointsInPaint != null &&
    Math.abs(home.pointsInPaint - away.pointsInPaint) >= gameStoryConfig.paintDominance.minPaintPointsMargin
  ) {
    tags.push("PAINT_DOMINANCE");
  }

  if (
    home.pointsFromTurnovers != null &&
    away.pointsFromTurnovers != null &&
    Math.abs(home.pointsFromTurnovers - away.pointsFromTurnovers) >= gameStoryConfig.turnoverPressure.minPointsFromTurnoversMargin
  ) {
    tags.push("TURNOVER_PRESSURE");
  }

  const homeReb = home.offensiveRebounds != null && home.defensiveRebounds != null ? home.offensiveRebounds + home.defensiveRebounds : null;
  const awayReb = away.offensiveRebounds != null && away.defensiveRebounds != null ? away.offensiveRebounds + away.defensiveRebounds : null;
  if (homeReb != null && awayReb != null && Math.abs(homeReb - awayReb) >= gameStoryConfig.reboundingEdge.minReboundMargin) {
    tags.push("REBOUNDING_EDGE");
  }

  return tags;
}

export function buildGameStorySummary(game: GameCore): Insight[] {
  const insights: Insight[] = [];
  const { home, away } = game;
  const winner = home.score >= away.score ? home : away;
  const loser = winner === home ? away : home;
  const reg = regulationPeriods(game.periods);

  if (reg.length >= 2) {
    const firstHalf = reg[0];
    const winnerFirstHalf = winner === home ? firstHalf.homeScore : firstHalf.awayScore;
    const loserFirstHalf = winner === home ? firstHalf.awayScore : firstHalf.homeScore;
    if (loserFirstHalf - winnerFirstHalf >= gameStoryConfig.comeback.minDeficitOvercome) {
      const finalReg = reg[reg.length - 1];
      const winnerSecond = (winner === home ? finalReg.homeScore : finalReg.awayScore) - winnerFirstHalf;
      const loserSecond = (winner === home ? finalReg.awayScore : finalReg.homeScore) - loserFirstHalf;
      insights.push({
        text: `${winner.shortName} trailed by ${loserFirstHalf - winnerFirstHalf} at halftime before outscoring ${loser.shortName} ${winnerSecond}–${loserSecond} in the second half.`,
      });
    }
  }

  const winnerFgPct = winner.fieldGoalsMade != null && winner.fieldGoalsAttempted ? (winner.fieldGoalsMade / winner.fieldGoalsAttempted) * 100 : null;
  if (winnerFgPct != null) {
    insights.push({ text: `${winner.shortName} shot ${winnerFgPct.toFixed(1)}% from the field.` });
  }

  if (winner.biggestLead != null && winner.biggestLead > 0) {
    insights.push({ text: `${winner.shortName}'s biggest lead was ${winner.biggestLead} points.` });
  }

  if (loser.biggestLead === 0) {
    insights.push({ text: `${loser.shortName} never led.` });
  }

  return insights.slice(0, 4);
}
