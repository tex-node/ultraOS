import { formatPercent, normalizedSeparation, percent } from "./normalization";
import type { GameCore, WhyTheyWonFactor } from "./types";

// Reasonable ceilings used only to normalize otherwise-incomparable stats onto a common
// 0-1 separation scale for ranking — not displayed anywhere. Calibrated to Ultra Basketball's
// short-format scoring range (see game-story.ts's comment on real Season Zero score spread).
const CEILINGS = {
  percent: 100,
  rebounds: 15,
  assists: 10,
  turnovers: 10,
  paintPoints: 20,
  benchPoints: 15,
  secondHalfSwing: 20,
};

type Candidate = { key: string; label: string; separation: number; winnerValue: string; loserValue: string };

// A "why they won" factor must genuinely favor the winner — a nonzero gap running the other
// way (the loser had more bench points, outscored them in the second half, etc.) is a real,
// interesting number but it is not a reason they won, so it must never be surfaced here. Every
// push below is gated on `winnerIsBetter` for exactly that reason.
export function rankWhyTheyWon(game: GameCore): WhyTheyWonFactor[] {
  const { home, away } = game;
  const winner = home.score >= away.score ? home : away;
  const loser = winner === home ? away : home;
  const candidates: Candidate[] = [];

  const winnerFg = percent(winner.fieldGoalsMade, winner.fieldGoalsAttempted);
  const loserFg = percent(loser.fieldGoalsMade, loser.fieldGoalsAttempted);
  if (winnerFg != null && loserFg != null && winnerFg > loserFg) {
    candidates.push({
      key: "SHOOTING_EDGE",
      label: "Shooting edge",
      separation: normalizedSeparation(winnerFg, loserFg, CEILINGS.percent),
      winnerValue: formatPercent(winnerFg),
      loserValue: formatPercent(loserFg),
    });
  }

  const winnerReb = winner.offensiveRebounds != null && winner.defensiveRebounds != null ? winner.offensiveRebounds + winner.defensiveRebounds : null;
  const loserReb = loser.offensiveRebounds != null && loser.defensiveRebounds != null ? loser.offensiveRebounds + loser.defensiveRebounds : null;
  if (winnerReb != null && loserReb != null && winnerReb > loserReb) {
    candidates.push({
      key: "REBOUNDING",
      label: "Rebounding",
      separation: normalizedSeparation(winnerReb, loserReb, CEILINGS.rebounds),
      winnerValue: String(winnerReb),
      loserValue: String(loserReb),
    });
  }

  if (winner.assists != null && loser.assists != null && winner.assists > loser.assists) {
    candidates.push({
      key: "PLAYMAKING",
      label: "Playmaking",
      separation: normalizedSeparation(winner.assists, loser.assists, CEILINGS.assists),
      winnerValue: String(winner.assists),
      loserValue: String(loser.assists),
    });
  }

  // Fewer turnovers is better, so the comparison is intentionally reversed here.
  if (winner.turnovers != null && loser.turnovers != null && winner.turnovers < loser.turnovers) {
    candidates.push({
      key: "BALL_SECURITY",
      label: "Ball security",
      separation: normalizedSeparation(loser.turnovers, winner.turnovers, CEILINGS.turnovers),
      winnerValue: `${winner.turnovers} TO`,
      loserValue: `${loser.turnovers} TO`,
    });
  }

  if (winner.pointsInPaint != null && loser.pointsInPaint != null && winner.pointsInPaint > loser.pointsInPaint) {
    candidates.push({
      key: "PAINT_POINTS",
      label: "Paint points",
      separation: normalizedSeparation(winner.pointsInPaint, loser.pointsInPaint, CEILINGS.paintPoints),
      winnerValue: String(winner.pointsInPaint),
      loserValue: String(loser.pointsInPaint),
    });
  }

  if (winner.benchPoints != null && loser.benchPoints != null && winner.benchPoints > loser.benchPoints) {
    candidates.push({
      key: "BENCH_PRODUCTION",
      label: "Bench production",
      separation: normalizedSeparation(winner.benchPoints, loser.benchPoints, CEILINGS.benchPoints),
      winnerValue: String(winner.benchPoints),
      loserValue: String(loser.benchPoints),
    });
  }

  const reg = game.periods.filter((p) => !/^OT/i.test(p.label));
  if (reg.length >= 2) {
    const first = reg[0];
    const finalReg = reg[reg.length - 1];
    const winnerSecond = (winner === home ? finalReg.homeScore : finalReg.awayScore) - (winner === home ? first.homeScore : first.awayScore);
    const loserSecond = (winner === home ? finalReg.awayScore : finalReg.homeScore) - (winner === home ? first.awayScore : first.homeScore);
    if (winnerSecond > loserSecond) {
      candidates.push({
        key: "SECOND_HALF_TAKEOVER",
        label: "Second-half takeover",
        separation: normalizedSeparation(winnerSecond, loserSecond, CEILINGS.secondHalfSwing),
        winnerValue: `${winnerSecond}`,
        loserValue: `${loserSecond}`,
      });
    }
  }

  return candidates
    .filter((c) => c.separation > 0)
    .sort((a, b) => b.separation - a.separation)
    .slice(0, 3)
    .map((c) => ({ key: c.key, label: c.label, winnerValue: c.winnerValue, loserValue: c.loserValue, separation: c.separation }));
}
