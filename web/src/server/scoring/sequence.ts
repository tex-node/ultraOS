import "server-only";

import type { Prisma } from "@/generated/prisma/client";

// Shared by createGameEvent and correctStatisticianEvent: increments the game's event-sequence
// counter and returns the value to assign to the new event (the pre-increment value, matching
// the old inline `nextSequence` idiom). Takes the already-loaded current value rather than
// re-reading it - both callers already hold the locked game (via loadMutableGame /
// loadFinalGameForCorrection) before this runs, so a second read would be a wasted round-trip
// on a latency-sensitive live-write path.
export async function assignNextSequence(
  tx: Prisma.TransactionClient,
  gameId: string,
  currentSequence: number,
): Promise<number> {
  await tx.game.update({
    where: { id: gameId },
    data: { nextEventSequence: { increment: 1 } },
  });
  return currentSequence;
}
