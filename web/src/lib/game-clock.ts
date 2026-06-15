export function remainingClockSeconds(game: {
  status: string;
  clockSecondsRemaining: number;
  clockStartedAt: Date | null;
}) {
  if (game.status !== "LIVE" || !game.clockStartedAt) {
    return game.clockSecondsRemaining;
  }
  const elapsed = Math.floor((Date.now() - game.clockStartedAt.getTime()) / 1000);
  return Math.max(0, game.clockSecondsRemaining - elapsed);
}
