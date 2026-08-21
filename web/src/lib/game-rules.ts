// Ultra Basketball Season Zero competitive rules. Centralized here so scoring, the scorer
// console, the public live page, and broadcast outputs all read the same configuration
// instead of hard-wiring assumptions.
export const ULTRA_RULES = {
  halves: 2,
  halfSeconds: 600,
  shotClockSeconds: 20,
  ultraTimeThresholdSeconds: 60,
  ultraTimeMultiplier: 2,
} as const;

export const FINAL_PERIOD = ULTRA_RULES.halves;

export function periodLabel(period: number, status: string) {
  if (status === "FINAL") return "FINAL";
  if (period > ULTRA_RULES.halves) return "FINAL";
  if (period === ULTRA_RULES.halves) return "HALF 2";
  return "HALF 1";
}

export function isUltraTime(game: { currentPeriod: number; status: string }, remainingSeconds: number) {
  return (
    game.status === "LIVE" &&
    game.currentPeriod >= FINAL_PERIOD &&
    remainingSeconds > 0 &&
    remainingSeconds <= ULTRA_RULES.ultraTimeThresholdSeconds
  );
}

export function remainingShotClockSeconds(game: {
  status: string;
  shotClockSecondsRemaining: number;
  shotClockStartedAt: Date | null;
}) {
  if (game.status !== "LIVE" || !game.shotClockStartedAt) {
    return game.shotClockSecondsRemaining;
  }
  const elapsed = Math.floor((Date.now() - game.shotClockStartedAt.getTime()) / 1000);
  return Math.max(0, game.shotClockSecondsRemaining - elapsed);
}

export function awardedPoints(shotValue: number, ultraTime: boolean) {
  if (shotValue <= 0) {
    // A manual scoreboard correction, not a shot — never multiplied.
    return { basePointValue: null, multiplier: null, pointsAwarded: shotValue };
  }
  const multiplier = ultraTime ? ULTRA_RULES.ultraTimeMultiplier : 1;
  return { basePointValue: shotValue, multiplier, pointsAwarded: shotValue * multiplier };
}
