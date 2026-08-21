import { badgeThresholds } from "./config";
import { percent } from "./normalization";
import { isFourPointQualified } from "./qualification";
import type { BadgeKey, GameCore, PlayerLine } from "./types";

// Deterministic badge rules. A badge is only ever awarded from real, present fields — never
// inferred when the relevant stat is null (NOT_CAPTURED), per the availability model.

export function playerBadges(player: PlayerLine, game: GameCore, isGameStar: boolean): BadgeKey[] {
  const badges: BadgeKey[] = [];
  if (isGameStar) badges.push("GAME_STAR");

  const threePct = percent(player.threePointsMade, player.threePointsAttempted);
  if (threePct != null && player.threePointsMade != null &&
    threePct >= badgeThresholds.sniper.minThreePointPercent && player.threePointsMade >= badgeThresholds.sniper.minThreePointMakes) {
    badges.push("SNIPER");
  }

  if (
    player.fieldGoalsAttempted != null &&
    player.fieldGoalsAttempted >= badgeThresholds.perfectShooting.minAttempts &&
    player.fieldGoalsMade === player.fieldGoalsAttempted
  ) {
    badges.push("PERFECT_SHOOTING");
  }

  if (player.rebounds >= badgeThresholds.glassCleaner.minRebounds) badges.push("GLASS_CLEANER");
  if (player.assists >= badgeThresholds.playmaker.minAssists) badges.push("PLAYMAKER");
  if (player.steals >= badgeThresholds.lockdown.minSteals) badges.push("LOCKDOWN");

  // BENCH_SPARK is deliberately not awarded per-player: PlayerStat has no starter/bench flag
  // for these imported games (FIBA box scores don't carry one through our transcription), so
  // there is no real signal for which individual scored while actually coming off the bench —
  // only the team-level benchPoints total is real. Inferring it from a player's point total
  // alone would tag starters as "bench sparks" whenever their team's bench also scored well.

  if (player.efficiency != null && player.efficiency >= badgeThresholds.highEfficiency.minEfficiency) {
    badges.push("HIGH_EFFICIENCY");
  }

  // FOUR_POINT_THREAT / ULTRA_PLAYER require real, event-derived Ultra data — never awarded
  // from an imported box score, which has no visibility into 4PT/Ultra Time at all.
  if (game.dataCapability === "ULTRA_NATIVE_EVENTS" && isFourPointQualified(player.fourPointsAttempted)) {
    // Reserved for capability-gated Ultra badges; intentionally not added to BadgeKey union
    // until real ULTRA_NATIVE_EVENTS games exist to validate against.
  }

  return badges;
}

export const BADGE_LABEL: Record<BadgeKey, string> = {
  GAME_STAR: "Game Star",
  SNIPER: "Sniper",
  PERFECT_SHOOTING: "Perfect Shooting",
  GLASS_CLEANER: "Glass Cleaner",
  PLAYMAKER: "Playmaker",
  LOCKDOWN: "Lockdown",
  BENCH_SPARK: "Bench Spark",
  PAINT_BEAST: "Paint Beast",
  HIGH_EFFICIENCY: "High Efficiency",
};
