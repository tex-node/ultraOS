import "server-only";

import { prisma } from "@/lib/prisma";
import { loadFinalGameForCorrection, type FinalGame } from "./load-final-game";
import type { AuthActor, EventSource, LedgerSourceHint, WriteContext } from "./types";

// Mirrors withGameWrite exactly, swapping in the FINAL-game loader: opens a transaction, loads
// the game under the same FOR UPDATE lock, and passes it to the callback. Kept as a matching
// wrapper (not inlined per-caller) so the two service shapes - createGameEvent's mutable-game
// path and correctStatisticianEvent's FINAL-game path - read the same way at every call site.
export async function withFinalGameWrite<T>(
  gameId: string,
  fixtureId: string,
  ctx: {
    actor: AuthActor;
    source: EventSource;
    ledgerSourceHint?: LedgerSourceHint;
  },
  fn: (writeCtx: WriteContext & { game: FinalGame }) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const game = await loadFinalGameForCorrection(tx, gameId, fixtureId);
    return fn({ ...ctx, tx, game });
  });
}
